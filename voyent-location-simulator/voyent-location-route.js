Voyent.LocationRoute = Polymer({
    is: "voyent-location-route",
    behaviors: [Voyent.LocationBehavior],

    /**
     * Custom constructor
     * @param map
     * @param users
     * @param label
     * @param user
     * @param origin
     * @param destination
     * @param travelmode
     * @param speed
     * @param speedunit
     * @param frequency
     * @param viaRoutesAttribute
     * @private
     */
    factoryImpl: function(map,users,label,user,origin,destination,travelmode,speed,speedunit,frequency,viaRoutesAttribute) {
        this._map = map;
        this._users = users;
        this.label = label || 'New Route';
        this.user = user || '';
        this.origin = origin || '';
        this.destination = destination || '';
        this.travelmode = travelmode || 'DRIVING';
        this.speed = speed || 50;
        this.speedunit = speedunit || 'kph';
        this.frequency = frequency || 5;
        this.viaRoutesAttribute = !!viaRoutesAttribute;
    },

    properties: {
        /**
         * The name or label of this route.
         */
        label: { type: String, value: 'New Route', observer: '_labelChanged' },
        /**
         * The user to simulate motion for. This attribute must be set to a valid user in the realm. **Only available to admin users.**
         */
        user: { type: String, value: '', observer: '_userValidation' },
        /**
         * The starting point of the route, represented as an address or coordinate.
         */
        origin: { type: String, value: '', observer: '_originValidation' },
        /**
         * The ending point of the route, represented as an address or coordinate.
         */
        destination: { type: String, value: '', observer: '_destinationValidation' },
        /**
         * The routing type between the `origin` and `destination`. Available options are `DRIVING`, `BICYCLING`, `WALKING` or `TRANSIT`.
         */
        travelmode: { type: String, value: 'DRIVING', observer: '_travelModeValidation' },
        /**
         * The approximate speed of travel along the path.
         */
        speed: { type: Number, value: 50, observer: '_speedValidation' },
        /**
         * The unit of speed. Valid values are are `kph` or `mph`.
         */
        speedunit: { type: String, value: 'kph', observer: '_speedunitValidation' },
        /**
         * The number of seconds to wait between location updates during a simulation.
         */
        frequency: { type: Number, value: 5, observer: '_frequencyValidation' }
    },

    //observe non-declared/private properties
    observers: [
        '_mapChanged(_map)',
        '_usersChanged(_users)',
        '_pausedChanged(_paused)'
    ],

    /**
     * Fired at the beginning of a new simulation.
     * @event startSimulation
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
            Polymer.dom(this).parentNode.addEventListener('usersRetrieved', function(e) {
                _this._users = e.detail.users;
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
     * Simulate movement along a path defined by the `origin` and `destination` fields. Can be used to start a new simulation or to continue a currently paused simulation.
     */
    playSimulation: function() {
        var _this = this;
        if (!voyent.io.auth.isLoggedIn() || !Polymer.dom(this).parentNode.account || !Polymer.dom(this).parentNode.realm) {
            return;
        }
        if (!this._path) { //if no route then it's a new simulation
            if ((this._users && this._users.length > 0 && !this.user) || !this.origin || !this.destination) {
                return;
            }
            var failures=0;
            (function routeRequest(){
                _this._directionsService.route({
                    origin:_this._origin || _this.origin,
                    destination:_this._destination || _this.destination,
                    travelMode: google.maps.TravelMode[_this.travelmode]
                }, function(response, status) {
                    if (status !== google.maps.DirectionsStatus.OK) {
                        if (failures == 10) {
                            _this.fire('message-error', 'Directions request failed 10 times for: ' + _this.label + '. Not retrying.');
                            console.error('Directions request failed 10 times for: ' + _this.label + '. Not retrying.');
                            return;
                        }
                        setTimeout(function () {
                            routeRequest();
                        },3000);
                        failures++;
                        return;
                    }
                    _this.fire('message-info', 'Successfully started route: ' + _this.label);
                    _this._directionsRenderer.setDirections(response);
                    //Use the steps of the legs instead of overview_path/polyline_path because they are the most atomic unit of a directions route
                    var legs = response.routes[0].legs;
                    var route = [];
                    for (var i=0;i<legs.length;i++) {
                        var steps = legs[i].steps;
                        for (var j=0;j<steps.length;j++) {
                            Array.prototype.push.apply(route, steps[j].path);
                        }
                    }
                    route = _this._processRoute(route); //add more coordinates than what is provided by Google so we can move smoother along the path
                    _this._path = route;
                    var totalSecs = legs[0].distance.value / (_this.speed * (_this.speedunit === 'kph'? _this._KPH_TO_MPS : _this._MPH_TO_MPS)); //number of seconds to travel the entire route (distance in m / speed in m/s)
                    _this._totalMills = 1000 * totalSecs; //number of milliseconds to travel the entire route
                    _this._interval = 1000 / (route.length / totalSecs); //number of milliseconds to move one point
                    //Start by POSTing the first coordinate to the Location Service
                    _this._index = 0;
                    var location = { "location" : { "geometry" : { "type" : "Point", "coordinates" : [route[_this._index].lng(),route[_this._index].lat()] } } };
                    location.username = _this.user || voyent.io.auth.getLastKnownUsername();
                    location.demoUsername = _this.user || voyent.io.auth.getLastKnownUsername(); //(NTFY-301)
                    voyent.io.locate.updateLocation({realm:Polymer.dom(_this).parentNode.realm,location:location}).then(function(data) {
                        //set location object (take best guess at username and lastUpdated without re-retrieving record)
                        _this._location = location;
                        _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
                        //set marker object
                        var marker = new google.maps.Marker({
                            position: route[_this._index],
                            map: _this._map,
                            draggable: false, //don't allow manual location changes during simulation
                            icon: _this.pathtoimages+'/images/user_marker.png'
                        });
                        _this._marker = marker;
                        //initialize ETA
                        _this._updateETA(_this._totalMills-_this._interval);
                        //start simulation
                        _this.fire('startSimulation',{locationMarker:marker,location:location,child:_this,type:'route'}); //pass required data to the parent component
                        _this._doSimulation();
                        //set button states
                        _this._inputsDisabled=true;
                        _this._cancelBtnDisabled=false;
                        _this._updateBtnDisabled=false;
                    }).catch(function(error) {
                        _this.fire('message-error', 'Issue updating location: ' + error);
                        console.error('Issue updating location',error);
                    });
                });
            } )();
        }
        else if (this._paused) { //since we have a route, continue the simulation, but only if we are paused (so we don't start an already running simulation)
            this._doSimulation();
        }
    },

    /**
     * Retrieve the route in JSON format.
     * @returns {{label: *, user: *, origin: *, destination: *, travelmode: *, speed: *, frequency: *}}
     */
    getJSON: function() {
        return {
            label:this.label,
            user:this.user,
            origin:this._origin || this.origin,
            destination:this._destination || this.destination,
            travelmode:this.travelmode,
            speed:this.speed,
            speedunit:this.speedunit,
            frequency:this.frequency
        };
    },


    //******************PRIVATE API******************

    /**
     * Calculate more fine-grained coordinates than what is provided by the Google Maps API.
     * @param route
     * @private
     */
    _processRoute: function(route) {
        var newRoute = route.slice(0);
        for (var i=0; i<route.length; i++) {
            //nothing to do if we're at the last coordinate
            if (i+1 == route.length) {
                break;
            }
            //get coordinate provided by Google
            var lat1 = this._toRadians(route[i].lat());
            var lng1 = this._toRadians(route[i].lng());
            //get next coordinate provided by Google
            var lat2 = this._toRadians(route[i+1].lat());
            var lng2 = this._toRadians(route[i+1].lng());
            //save the operator so we know when to stop adding coordinates between the ones provided by Google
            var latOp = lat1 < lat2 ? '<' : '>';
            var lngOp = lng1 < lng2 ? '<' : '>';
            //add coordinates between the two points
            (addCoordinates)(lat1, lng1);
        }
        return newRoute;

        //Recursive function to add more coordinates between two Google provided coordinates
        function addCoordinates(lat1, lng1) {
            //calculate bearing from [lat1,lng1] to [lat2,lng2]
            var y = Math.sin(lng2-lng1) * Math.cos(lat2);
            var x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lng2-lng1);
            var bearing = Math.atan2(y, x);
            //calculate next point, 2 meters from current point towards next point
            var dist = 2; //distance in meters
            var eRadius = this._EARTH_RADIUS;
            var lat = Math.asin(Math.sin(lat1)*Math.cos(dist/eRadius) +
                Math.cos(lat1)*Math.sin(dist/eRadius)*Math.cos(bearing));
            var lng = lng1 + Math.atan2(Math.sin(bearing)*Math.sin(dist/eRadius)*Math.cos(lat1),
                Math.cos(dist/eRadius)-Math.sin(lat1)*Math.sin(lat2));

            if ( !((compare(latOp,lat,lat2)) && (compare(lngOp,lng,lng2))) ) {
                return false; //we've reached the next point so stop adding coordinates for this iteration
            }
            newRoute.splice(i+1+(newRoute.length-route.length), 0, new google.maps.LatLng(this._toDegrees(lat),this._toDegrees(lng))); //add the new coordinates to the correct position in the route
            addCoordinates(lat, lng);
        }
        //compare lat or long values with dynamic operator
        function compare(operator,a,b) {
            if (operator == '<') {
                return a < b;
            }
            return a > b;
        }
    },

    /**
     * Keep the ETA updated when moving along a route during simulation.
     * @param mills
     * @private
     */
    _updateETA: function(mills) {
        this._totalMills = mills;
        this._eta = new Date(this._totalMills).toISOString().substr(11, 12);
        if (this._eta === '00:00:00.000') {
            this._eta = null;
            this._totalMills = 0;
        }
    },

    /**
     * When the simulation is completed or cancelled do some cleanup.
     * @private
     */
    _cleanupSimulation: function() {
        //allow the location marker to be dragged
        this._marker.setDraggable(true);
        //remove the directions overlay
        this._directionsRenderer.set('directions', null);
        //add listener now that the simulation is done
        this._userLocationChangedListener(this._marker,this._location);
        //reset attributes
        this._path = null;
        this._index = 0;
        this._interval = 0;
        this._location = null;
        this._eta = null;
        this._totalMills = 0;
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
     * Store the address of the place selected in the `origin` and `destination` autocompletes and center/zoom the map when a location is selected.
     * @param input
     * @param property
     * @private
     */
    _autocompleteListener: function(input,property) {
        var _this = this;
        google.maps.event.addListener(input, 'place_changed', function() {
            var coordinates = input.getPlace().geometry.location;
            _this[property] = coordinates.lat()+','+coordinates.lng(); //set the exact coordinate of the selected location in the background so we can use it for the directions search
            _this._map.setCenter(coordinates); //center map on selected location
            _this._map.setZoom(18); //zoom in on selected location
        });
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
            //setup direction objects for querying and drawing directions
            this._directionsService = new google.maps.DirectionsService();
            this._directionsRenderer = new google.maps.DirectionsRenderer({map:this._map,preserveViewport:true,hideRouteList:true,suppressMarkers:true});
            //setup autocomplete for route inputs
            var origin = new google.maps.places.Autocomplete(this.$$("#origin"),{bounds:this._map.getBounds()});
            this._autocompleteListener(origin,'_origin');
            var destination = new google.maps.places.Autocomplete(this.$$("#destination"),{bounds:this._map.getBounds()});
            this._autocompleteListener(destination,'_destination');
        }
    },

    /**
     * Validates the `user` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _userValidation: function(newVal,oldVal) {
        if (!newVal || newVal.trim().length === 0) {
            this.userInputClass='form-control error';
            this.userLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.userInputClass='form-control';
        this.userLblClass='';
        if (this.origin && this.destination) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Validates the `origin` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _originValidation: function(newVal,oldVal) {
        if (!newVal || newVal.trim().length === 0) {
            this.originInputClass='form-control error';
            this.originLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.originInputClass='form-control';
        this.originLblClass='';
        if ((this.user || (!this._users || this._users.length==0)) && this.destination) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Validates the `destination` attribute. If invalid show indication on the input.
     * @param newVal
     * @param oldVal
     * @private
     */
    _destinationValidation: function(newVal,oldVal) {
        if (!newVal || newVal.trim().length === 0) {
            this.destInputClass='form-control error';
            this.destLblClass='error';
            this._playBtnDisabled=true;
            return;
        }
        this.destInputClass='form-control';
        this.destLblClass='';
        if ((this.user || (!this._users || this._users.length==0)) && this.origin) {
            this._playBtnDisabled=false;
        }
    },

    /**
     * Validates the `travelmode` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _travelModeValidation: function(newVal,oldVal) {
        var validModes = ['DRIVING','BICYCLING','WALKING','TRANSIT'];
        if (validModes.indexOf(newVal) == -1) {
            if (validModes.indexOf(newVal.toUpperCase()) > -1) {
                this.travelmode = newVal.toUpperCase();
                return;
            }
            this.travelmode = oldVal || 'DRIVING';
        }
    },

    /**
     * Fire `labelChanged` event.
     * @param newVal
     * @param oldVal
     * @private
     */
    _labelChanged: function(newVal,oldVal) {
        this.fire('labelChanged',{child:this,label:newVal});
    },

    /**
     * If the realm users are provided then ensure the user exists in the realm and that they are selected.
     * @param users
     * @private
     */
    _usersChanged: function(users) {
        var _this = this;
        if (users && users.length > 0) {
            setTimeout(function() {
                var user = _this.user;
                _this.set('user','');
                var usernames = users.filter(function(username) {
                    return username === user;
                });
                if (usernames.length > 0) {
                    _this.set('user',user);
                }
            },0);
        }
        else {
            this.set('user','');
        }
    },

    /**
     * Set `origin`.
     * @param origin
     * @private
     */
    _setOrigin: function(origin) {
        this._origin = null;
        this.origin = origin;
    },

    /**
     * Set `destination`.
     * @param destination
     * @private
     */
    _setDestination: function(destination) {
        this._destination = null;
        this.destination = destination;
    }
});