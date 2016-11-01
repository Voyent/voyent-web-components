Voyent.LocationVector = Polymer({
    is: "voyent-location-vector",
    behaviors: [Voyent.LocationBehavior],

    /**
     * Custom constructor
     * @param map
     * @param trackers
     * @param label
     * @param tracker
     * @param bearing
     * @param speed
     * @param speedunit
     * @param duration
     * @param frequency
     * @param viaAttribute
     * @private
     */
    factoryImpl: function(map,trackers,label,tracker,bearing,speed,speedunit,duration,frequency,viaAttribute) {
        var _this = this;
        this._map = map;
        this._trackers = trackers;
        this.label = label || 'New Vector';
        //set the tracker async so the select menu gets populated
        setTimeout(function() {
            _this.tracker = tracker || '';
        },0);
        this.bearing = bearing || 0;
        this.speed = speed || 50;
        this.speedunit = speedunit || 'kph';
        this.duration = duration || 2;
        this.frequency = frequency || 5;
        this.viaAttribute = !!viaAttribute;
    },

    properties: {
        /**
         * The name or label of this route.
         */
        label: { type: String, value: 'New Vector', observer: '_labelChanged' },
        /**
         * The tracker id to simulate motion for. This attribute must be set to a valid tracker in the realm.
         */
        tracker: { type: String, value: '', observer: '_trackerValidation' },
        /**
         * The direction of motion in degrees (0-359).
         */
        bearing: { type: Number, value: 0, observer: '_bearingValidation' },
        /**
         * The approximate speed of travel along the path.
         */
        speed: { type: Number, value: 50, observer: '_speedValidation' },
        /**
         * The unit of speed. Valid values are are `kph` or `mph`.
         */
        speedunit: { type: String, value: 'kph', observer: '_speedunitValidation' },
        /**
         * The time in minutes that the tracker will move along it's vector.
         */
        duration: { type: Number, value: 2, observer: '_durationValidation' },
        /**
         * The number of seconds to wait between location updates during a simulation.
         */
        frequency: { type: Number, value: 5, observer: '_frequencyValidation' }
    },

    //observe non-declared/private properties
    observers: [
        '_mapChanged(_map)',
        '_trackersChanged(_trackers)',
        '_pausedChanged(_paused)'
    ],

    /**
     * Fired at the beginning of a new simulation.
     * @event startSimulation
     */
    /**
     * Fired when the simulation finishes or is stopped manually.
     * @event endSimulation
     */
    /**
     * Fired when the label is changed.
     * @event labelChanged
     */

    ready: function() {
        var _this = this;
        if (Polymer.dom(this).parentNode) {
            //if this component is defined in the light DOM it will have a parent (voyent-location-simulator) when this ready is called,
            //so we want to setup listeners on the parent to set the map and users properties inside this component. If there is no parent
            //(the component is created using the constructor) then the map and user properties will be set in the custom constructor instead.
            Polymer.dom(this).parentNode.addEventListener('mapInitialized', function(e) {
                _this._map = e.detail.map;
            });
            Polymer.dom(this).parentNode.addEventListener('trackersRetrieved', function(e) {
                _this._trackers = e.detail.trackers;
            });
        }
        this.pathtoimages = '.';
        document.addEventListener('pathtoimagesChanged', function(e) {
            _this.pathtoimages = e.detail.path;
        });
        //set some default values
        this._previousBtnDisabled = true;
        this._nextBtnDisabled = true;
        this._cancelBtnDisabled = true;
        this._playBtnDisabled = true;
        this._pauseBtnDisabled = true;
        this._updateBtnDisabled = true;
    },

    /**
     * Simulate movement along a path defined by the `bearing`, `speed` and `duration` fields. Can be used to start a new simulation or to continue a currently paused simulation.
     */
    playSimulation: function() {
        var _this = this;
        if (!voyent.io.auth.isLoggedIn() || !Polymer.dom(this).parentNode.account || !Polymer.dom(this).parentNode.realm) {
            return;
        }
        if (!this._path) {
            if ((this._trackers && Object.keys(this._trackers).length && !this.tracker) /*|| !this.bearing || !this.duration*/) {
                return;
            }
            var tracker = this._trackers[_this.tracker].tracker;

            this._totalDistance = this._calculateTotalDistance(); //store total distance of path
            var path = _this._generatePath(tracker);
            this._path = path;
            this._interval = 1000 / (path.length / (this.duration * 60)); //number of milliseconds to move one point

            //Start by POSTing the first coordinate to the Location Service
            this._index = 0;
            var location = {
                "location" : {
                    "geometry" : {
                        "type" : "Point", "coordinates" : [path[this._index].lng(),path[this._index].lat()]
                    },
                    "properties": {
                        "trackerId": this.tracker,
                        "zoneNamespace": tracker.properties.zoneNamespace
                    }
                },
                "username":this.tracker,
                "demoUsername":this.tracker
            };
            voyent.io.locate.updateTrackerLocation({realm:Polymer.dom(this).parentNode.realm,location:location}).then(function(data) {
                //set location object (take best guess at username and lastUpdated without re-retrieving record)
                _this._location = location;
                _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
                //set marker object
                var icon = tracker.properties.icon ? tracker.properties.icon : 'incident_marker.png'; //********** - INCIDENT DEMO SPECIFIC CODE - **********
                var marker = new google.maps.Marker({
                    position: path[_this._index],
                    map: _this._map,
                    icon:_this.pathtoimages+'/images/'+icon,
                    draggable: false //don't allow manual location changes during simulation
                });
                _this._marker = marker;
                //move the zones with the tracker
                _this._trackerMoved(_this.tracker,marker);
                //start simulation
                _this.fire('startSimulation',{locationMarker:marker,location:location,child:_this,type:'vector'}); //pass required data to the parent component
                _this._doSimulation();
                //set button states
                _this._inputsDisabled=true;
                _this._cancelBtnDisabled=false;
                _this._updateBtnDisabled=false;
            }).catch(function(error) {
                _this.fire('message-error', 'Issue updating tracker location: ' + error);
                console.error('Issue updating location',error);
            });
        }
        else if (this._paused) { //since we have a path, continue the simulation, but only if we are paused (so we don't start an already running simulation)
            this._doSimulation();
        }
    },

    /**
     * Retrieve the vector in JSON format.
     * @returns {{label: *, tracker: *, bearing: *, speed: *, speedunit: *, duration: *, frequency: *}}
     */
    getJSON: function() {
        return {
            label:this.label,
            tracker:this.tracker,
            bearing:this.bearing,
            speed:this.speed,
            speedunit:this.speedunit,
            duration:this.duration,
            frequency:this.frequency
        };
    },


    //******************PRIVATE API******************

    /**
     * Generate coordinates based on a specific bearing, speed and duration.
     * @param tracker
     * @private
     */
    _generatePath: function(tracker) {
        var _this = this;
        var path = [];
        var coordDistance = 2; //distance between each coordinate, in meters
        var numCoords = this._totalDistance / coordDistance; //the number of coordinates needed to cover the path distance

        var lat1 = this._toRadians(tracker.anchor.geometry.coordinates[1]);
        var lng1 = this._toRadians(tracker.anchor.geometry.coordinates[0]);
        addCoordinates(lat1,lng1);
        return path;

        //generate coordinates 2 meters apart until we reach the number of coordinates that we need
        function addCoordinates(lat1, lng1) {
            var bearing = _this._toRadians(_this.bearing);
            var eRadius = _this._EARTH_RADIUS;

            var lat2 = Math.asin(Math.sin(lat1)*Math.cos(coordDistance/eRadius) +
                Math.cos(lat1)*Math.sin(coordDistance/eRadius)*Math.cos(bearing));
            var lng2 = lng1 + Math.atan2(Math.sin(bearing)*Math.sin(coordDistance/eRadius)*Math.cos(lat1),
                    Math.cos(coordDistance/eRadius)-Math.sin(lat1)*Math.sin(lat2));

            path.push(new google.maps.LatLng(_this._toDegrees(lat2),_this._toDegrees(lng2)));

            if (path.length < numCoords) {
                addCoordinates(lat2, lng2);
            }
        }
    },

    /**
     * When the simulation is completed or cancelled do some cleanup.
     * @private
     */
    _cleanupSimulation: function() {
        //fire endSimulation event
        this.fire('endSimulation',{child:this,type:'vector'});
        //allow the location marker to be dragged
        this._marker.setDraggable(true);
        //add listener now that the simulation is done
        this._trackerLocationChangedListener(this._marker,this.tracker,this._location);
        //reset attributes
        this._path = null;
        this._totalDistance = null;
        this._index = 0;
        this._interval = 0;
        this._location = null;
        this._canceled = false;
        this._isMultiSim = false;
        this._inputsDisabled = false;
        this._previousBtnDisabled=true;
        this._nextBtnDisabled=true;
        this._cancelBtnDisabled = true;
        this._playBtnDisabled = false;
        this._pauseBtnDisabled = true;
        this._updateBtnDisabled = true;
    },

    /**
     * Calculate the total vector distance based on the current speed and duration.
     * @returns {number}
     * @private
     */
    _calculateTotalDistance: function() {
        var speed = this.speed * (this.speedunit === 'kph'? this._KPH_TO_MPS : this._MPH_TO_MPS); //speed in m/s
        var time = this.duration * 60; //time of travel in seconds
        return speed * time; //duration in meters
    },

    /**
     * Validates the `tracker` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _trackerValidation: function(newVal,oldVal) {
        if (!newVal || newVal.trim().length === 0) {
            this.trackerInputClass='form-control error';
            this.trackerLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.trackerInputClass='form-control';
        this.trackerLblClass='';
        if (this.bearing.toString() && this.duration.toString()) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Validates the `bearing` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _bearingValidation: function(newVal,oldVal) {
        if (isNaN(newVal) || newVal < 0 || newVal >= 360) {
            this.bearingInputClass='form-control error';
            this.bearingLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.bearingInputClass='form-control';
        this.bearingLblClass='';
        if ((this.tracker || (!this._trackers || Object.keys(this._trackers).length==0)) && this.duration && this.duration.toString().length > 0) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Validates the `duration` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _durationValidation: function(newVal,oldVal) {
        if (isNaN(newVal) || newVal <= 0) {
            this.durationInputClass='form-control error';
            this.durationLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.durationInputClass='form-control';
        this.durationLblClass='';
        if ((this.tracker || (!this._trackers || Object.keys(this._trackers).length==0)) && this.bearing && this.bearing.toString().length > 0) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Once the map is available then setup map features.
     * @param map
     * @private
     */
    _mapChanged: function(map) {
        if (this._map) {
            //initialize bounds object for later use
            this._bounds = new google.maps.LatLngBounds();
        }
    },

    /**
     * If the trackers are provided then ensure the tracker exists in the realm and that it is selected.
     * @param trackers
     * @private
     */
    _trackersChanged: function(trackers) {
        var _this = this;
        if (trackers && trackers.length > 0) {
            setTimeout(function() {
                var tracker = _this.tracker;
                _this.set('tracker','');
                var matchingTrackers = trackers.filter(function(currTracker) {
                    return currTracker._id === tracker;
                });
                if (matchingTrackers.length > 0) {
                    _this.set('tracker',tracker);
                }
            },0);
        }
        else {
            this.set('tracker','');
        }
    }
});