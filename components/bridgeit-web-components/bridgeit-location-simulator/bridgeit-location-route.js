BridgeIt.LocationRoute = Polymer({
    is: "bridgeit-location-route",
    behaviors: [BridgeIt.LocationBehavior],

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
        user: { type: String, value: '' },
        /**
         * The starting point of the route, represented as an address or coordinate.
         */
        origin: { type: String, value: '' },
        /**
         * The ending point of the route, represented as an address or coordinate.
         */
        destination: { type: String, value: '' },
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
            //if this component is defined in the light DOM it will have a parent (bridgeit-location-simulator) when this ready is called,
            //so we want to setup listeners on the parent to set the map and users properties inside this component. If there is no parent
            //(the component is created using the constructor) then the map and user properties will be set in the custom constructor instead.
            Polymer.dom(this).parentNode.addEventListener('mapInitialized', function(e) {
                _this._map = e.detail.map;
            });
            Polymer.dom(this).parentNode.addEventListener('usersRetrieved', function(e) {
                _this._users = e.detail.users;
            });
        }
        //set some default values
        this._followUser = false;
        this._previousBtnDisabled = true;
        this._nextBtnDisabled = true;
        this._cancelBtnDisabled = true;
        this._playBtnDisabled = false;
        this._pauseBtnDisabled = true;
        this._updateBtnDisabled = true;
    },

    /**
     * Simulate movement along a path defined by the `origin` and `destination` fields. Can be used to start a new simulation or to continue a currently paused simulation.
     */
    playSimulation: function() {
        var _this = this;
        if (!Polymer.dom(this).parentNode.accesstoken || !Polymer.dom(this).parentNode.account || !Polymer.dom(this).parentNode.realm) {
            return;
        }
        if (!this._route) { //if no route then it's a new simulation
            if ((this._users && this._users.length > 0 && !this.user) || !this.origin || !this.destination) {
                return;
            }
            this._directionsService.route({
                origin:this._origin || this.origin,
                destination:this._destination || this.destination,
                travelMode: google.maps.TravelMode[this.travelmode]
            }, function(response, status) {
                if (status !== google.maps.DirectionsStatus.OK) {
                    return;
                }
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
                _this._route = route;
                var totalSecs = legs[0].distance.value / (_this.speed * (_this.speedunit === 'kph'? 0.277778 : 0.44704)); //number of seconds to travel the entire route (distance in m / speed in m/s)
                _this._totalMills = 1000 * totalSecs; //number of milliseconds to travel the entire route
                _this._interval = 1000 / (route.length / totalSecs); //number of milliseconds to move one point
                //Start by POSTing the first coordinate to the Location Service
                _this._index = 0;
                var location = { "location" : { "geometry" : { "type" : "Point", "coordinates" : [route[_this._index].lng(),route[_this._index].lat()] } } };
                bridgeit.io.location.updateLocation({location:location}).then(function(data) {
                    //set location object (take best guess at username and lastUpdated without re-retrieving record)
                    _this._location = location;
                    _this._location._id = data.uri.split("/").pop();
                    _this._location.username = _this.user;
                    _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
                    //set marker object
                    var marker = new google.maps.Marker({
                        position: route[_this._index],
                        map: _this._map,
                        draggable: false, //don't allow manual location changes during simulation
                        icon: 'resources/user.png'
                    });
                    _this._marker = marker;
                    //center and zoom on marker at the beginning of the simulation
                    _this._map.setCenter(marker.getPosition());
                    _this._map.setZoom(18);
                    //initialize ETA
                    _this._updateETA(_this._totalMills-_this._interval);
                    //start simulation
                    _this.fire('startSimulation',{locationMarker:marker,location:location,child:_this}); //pass required data to the parent component
                    _this._doSimulation();
                    //set button states
                    _this._inputsDisabled=true;
                    _this._cancelBtnDisabled=false;
                    _this._updateBtnDisabled=false;
                }).catch(function(error) {
                    console.log('Issue updating location:',error);
                });
            });
        }
        else if (this._paused) { //since we have a route, continue the simulation, but only if we are paused (so we don't start an already running simulation)
            this._doSimulation();
        }
    },

    /**
     * Pause the simulation at it's current location along the route.
     */
    pauseSimulation: function() {
        if (!this._route) {
            return;
        }
        this._paused = true;
    },

    /**
     * Cancel the currently running simulation.
     */
    cancelSimulation: function() {
        if (!this._route) {
            return;
        }
        this._canceled = true;
        //if the simulation is paused before it's cancelled then we must cleanup manually
        if (this._paused) {
            this._cleanupSimulation();
        }
    },

    /**
     * Get the next coordinate in the simulation and send it to the Location Service. Can be used to step forwards when the simulation is paused.
     */
    nextCoordinate: function() {
        var _this = this;
        var i = this._index+1; //get next coordinate
        if (!this._route || !this._marker || !this._location || !this._paused) {
            return;
        }
        var route = this._route;
        this._location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the next location
        bridgeit.io.location.updateLocation({location:this._location}).then(function() {
            _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            _this._marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the new location
            if (_this._followUser) {
                _this._map.setCenter(_this._marker.getPosition()); //center map on the marker
            }
            _this._updateETA(_this._totalMills-_this._interval); //update the ETA
            if (i+1 == route.length) {
                _this.updateLocationAtMarker();
                _this._cleanupSimulation();
                return;
            }
            _this._index = i;
            _this._previousBtnDisabled=false;
        }).catch(function(error) {
            console.log('Issue stepping to next location of user "' + _this._location.username + '":', error);
        });
    },

    /**
     * Get the previous coordinate in the simulation and send it to the Location Service. Can be used to step backwards when the simulation is paused.
     */
    previousCoordinate: function() {
        var _this = this;
        var i = this._index-1; //get previous coordinate
        if (!this._route || !this._marker || !this._location || !this._paused || i<0) {
            return;
        }
        var route = this._route;
        this._location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the previous location
        bridgeit.io.location.updateLocation({location:this._location}).then(function() {
            _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            _this._marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the new location
            if (_this._followUser) {
                _this._map.setCenter(_this._marker.getPosition()); //center map on the marker
            }
            _this._updateETA(_this._totalMills+_this._interval); //update the ETA
            _this._index = i;
            if (i === 0) {
                _this._previousBtnDisabled=true;
            }
        }).catch(function(error) {
            console.log('Issue stepping to previous location of user "' + _this._location.username + '":', error);
        });
    },

    /**
     * Force an update of the location at it's current point in the simulation. This is in addition to the updates already being triggered by the `frequency` attribute.
     */
    updateLocationAtMarker: function() {
        var _this = this;
        if (!this._location) {
            return;
        }
        bridgeit.io.location.updateLocation({location:this._location}).then(function(data) {
            if (!_this._location) {
                return; //the simulation has been cleaned up
            }
            _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
        }).catch(function(error) {
            console.log('Issue updating location:',error);
        });
    },

    /**
     * Retrieve the route in JSON format.
     * @returns {{label: *, user: *, origin: *, destination: *, travelmode: *, speed: *, frequency: *}}
     */
    getRouteJSON: function() {
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
            var lat1 = toRadians(route[i].lat());
            var lng1 = toRadians(route[i].lng());
            //get next coordinate provided by Google
            var lat2 = toRadians(route[i+1].lat());
            var lng2 = toRadians(route[i+1].lng());
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
            var eRadius = 6371000; //earth's mean radius in meters
            var lat = Math.asin(Math.sin(lat1)*Math.cos(dist/eRadius) +
                Math.cos(lat1)*Math.sin(dist/eRadius)*Math.cos(bearing));
            var lng = lng1 + Math.atan2(Math.sin(bearing)*Math.sin(dist/eRadius)*Math.cos(lat1),
                Math.cos(dist/eRadius)-Math.sin(lat1)*Math.sin(lat2));

            if ( !((compare(latOp,lat,lat2)) && (compare(lngOp,lng,lng2))) ) {
                return false; //we've reached the next point so stop adding coordinates for this iteration
            }
            newRoute.splice(i+1+(newRoute.length-route.length), 0, new google.maps.LatLng(toDegrees(lat),toDegrees(lng))); //add the new coordinates to the correct position in the route
            addCoordinates(lat, lng);
        }
        //compare lat or long values with dynamic operator
        function compare(operator,a,b) {
            if (operator == '<') {
                return a < b;
            }
            return a > b;
        }
        //convert degrees to radians
        function toRadians(degrees) {
            return degrees * Math.PI / 180;
        }
        //convert radians to degrees
        function toDegrees(radians) {
            return radians * 180 / Math.PI;
        }
    },

    /**
     * Handles continuous playing of the simulation.
     * @private
     */
    _doSimulation: function() {
        var _this = this;
        this._updateOnFrequency();
        this._paused = false;
        var i = this._index+1; //get next coordinate
        this._location.location.geometry.coordinates = [this._route[i].lng(),this._route[i].lat()]; //get the next location
        var updatePosition = setInterval(function() {
            _this._updateETA(_this._totalMills-_this._interval); //update the ETA
            _this._marker.setPosition({lat:_this._route[i].lat(),lng:_this._route[i].lng()}); //update the marker position
            if (_this._followUser) {
                _this._map.setCenter(_this._marker.getPosition()); //center map on the marker
            }
            if (_this._paused) {
                //save the current index and stop recursion
                _this._index = i;
                clearInterval(updatePosition);
                return;
            }
            if (_this._canceled || i+1 == _this._route.length) {
                //submit last coordinate to the location service
                if (i+1 == _this._route.length) {
                    _this.updateLocationAtMarker();
                }
                //cleanup simulation and stop recursion
                _this._cleanupSimulation();
                clearInterval(updatePosition);
                return;
            }
            i++;
            _this._location.location.geometry.coordinates = [_this._route[i].lng(),_this._route[i].lat()]; //get the next location
        },this._interval);
    },

    /**
     * Handles updating the location in the Location Service during simulation. The `frequency` attribute determines how often the location is updated on the server.
     * @private
     */
    _updateOnFrequency: function() {
        var _this = this;
        var updateLocation = setInterval(function() {
            if (_this._paused || _this._canceled || !_this._location) {
                clearInterval(updateLocation);
                return;
            }
            bridgeit.io.location.updateLocation({location:_this._location}).then(function(data) {
              _this._location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            }).catch(function(error) {
                console.log('Issue updating location:',error);
            });
        },this.frequency*1000);
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
        //fire endSimulation event
        this.fire('endSimulation',{child:this});
        //allow the location marker to be dragged
        this._marker.setDraggable(true);
        //remove the directions overlay
        this._directionsRenderer.set('directions', null);
        //add listener now that the simulation is done
        this._userLocationChangedListener(this._marker,this._location);
        //reset attributes
        this._route = null;
        this._index = 0;
        this._interval = 0;
        this._marker = null;
        this._location = null;
        this._eta = null;
        this._totalMills = 0;
        this._canceled = false;
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
            //setup direction objects for querying and drawing directions
            this._directionsService = new google.maps.DirectionsService();
            this._directionsRenderer = new google.maps.DirectionsRenderer({map:this._map});
            //setup autocomplete for route inputs
            var origin = new google.maps.places.Autocomplete(this.$$("#origin"),{bounds:this._map.getBounds()});
            this._autocompleteListener(origin,'_origin');
            var destination = new google.maps.places.Autocomplete(this.$$("#destination"),{bounds:this._map.getBounds()});
            this._autocompleteListener(destination,'_destination');
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
     * Validates the `speed` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _speedValidation: function(newVal,oldVal) {
        if (isNaN(newVal) || newVal <= 0) {
            this.speed = oldVal || 50;
        }
    },

    /**
     * Validates the `speedunit` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _speedunitValidation: function(newVal,oldVal) {
        if (newVal !== 'kph' && newVal !== 'mph') {
            this.speedunit = oldVal || 'kph';
        }
    },

    /**
     * Validates the `frequency` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _frequencyValidation: function(newVal,oldVal) {
        if (isNaN(newVal) || newVal <= 0) {
            this.frequency = oldVal || 5;
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
                var usernames = users.map(function(user) {
                    return user.username;
                }).filter(function(username) {
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
     * Toggle disabled button state.
     * @param paused
     * @private
     */
    _pausedChanged: function(paused) {
        this._previousBtnDisabled=!paused;
        this._nextBtnDisabled=!paused;
        this._playBtnDisabled = !paused;
        this._pauseBtnDisabled = paused;
    },

    /**
     * Toggle following the user along the route during simulation.
     * @private
     */
    _toggleFollowUser: function() {
        this._followUser = !this._followUser;
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