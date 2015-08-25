var _mSim;

Polymer({
    is: "bridgeit-motion-simulator",

    properties: {
        /**
         * Required to authenticate with BridgeIt.
         * @default bridgeit.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: bridgeit.io.auth.getLastAccessToken() },
        /**
         * The BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() },
        /**
         * The BridgeIt realm to simulate motion in.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: bridgeit.io.auth.getLastKnownRealm()},
        /**
         * Flag indicating if the simulation inputs should be rendered. Alternatively, these can be set directly using the attributes.
         */
        inputs: { type: Boolean, value: false },
        /**
         * Flag indicating if the simulation navigation buttons should be rendered. Alternatively, the simulation functions can be accessed directly.
         */
        buttons: { type: Boolean, value: false },
        /**
         * The starting point of the simulation, represented as an address or coordinate.
         */
        origin: { type: String, value: '' },
        /**
         * The ending point of the simulation, represented as an address or coordinate.
         */
        destination: { type: String, value: '' },
        /**
         * The routing type between the `origin` and `destination`. Available options are `DRIVING`, `BICYCLING`, `WALKING` or `TRANSIT`.
         */
        travelmode: { type: String, value: 'DRIVING', observer: '_travelModeValidation' },
        /**
         * The speed of travel along the path, in km/h.
         */
        speed: { type: Number, value: 50, observer: '_speedValidation' },
        /**
         * The number of seconds to wait between location updates during a simulation.
         */
        frequency: { type: Number, value: 5, observer: '_frequencyValidation' }
    },

    created: function() {
        _mSim = this;
        _mSim._locationMarkers = [];
        _mSim._regions = [];
        _mSim._poiMarkers = [];
    },

    ready: function() {
        //initialize google maps
        window.initializeLocationsMap = function() {
            var mapOptions = {
                zoom: 8,
                center: new google.maps.LatLng(51.067799, -114.085237),
                mapTypeControlOptions: {
                    style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                signed_in: false
            };
            _mSim._map = new google.maps.Map(_mSim.$.map, mapOptions);
            _mSim._bounds = new google.maps.LatLngBounds();
            _mSim._infoWindow = new google.maps.InfoWindow();
            _mSim._directionsRenderer = new google.maps.DirectionsRenderer({map:_mSim._map});
            _mSim._directionsService = new google.maps.DirectionsService();

            //setup ui and listener for adding new location markers
            var drawingManager = new google.maps.drawing.DrawingManager({
                drawingControlOptions: {
                    position:google.maps.ControlPosition.TOP_RIGHT,
                    drawingModes: [
                        google.maps.drawing.OverlayType.MARKER
                    ]
                },
                markerOptions: {
                    icon: 'resources/user.png',
                    draggable: true
                }
            });
            drawingManager.setMap(_mSim._map);
            _mSim._newUserLocationListener(drawingManager);

            //setup autocomplete for route inputs if they are being rendered
            if (_mSim.inputs) {
                var origin = new google.maps.places.Autocomplete(_mSim.$$("#origin"),{bounds:_mSim._map.getBounds()});
                _mSim._autocompleteListener(origin);
                var destination = new google.maps.places.Autocomplete(_mSim.$$("#destination"),{bounds:_mSim._map.getBounds()});
                _mSim._autocompleteListener(destination);
            }

            if (_mSim.accesstoken) {
                _mSim.refreshMap();
            }
        };
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = 'https://maps.googleapis.com/maps/api/js?v=3.exp&' +
            'libraries=places,geometry,visualization,drawing&callback=initializeLocationsMap';
        _mSim.$.container.appendChild(script);
    },

    /**
     * Retrieve the latest data from the Location Service and refresh the map.
     * @returns {*}
     */
    refreshMap: function() {
        if (typeof google === 'undefined' || !_mSim.realm) {
            return;
        }
        _mSim._clearLocations();
        _mSim._bounds = new google.maps.LatLngBounds();
        var promises = [];
        promises.push(bridgeit.io.location.findLocations({realm:_mSim.realm}).then(function(locations) {
            _mSim._updateLocations(locations);
        }));
        promises.push(bridgeit.io.location.getAllRegions({realm:_mSim.realm}).then(function(regions) {
            _mSim._updateRegions(regions);
        }));
        promises.push(bridgeit.io.location.getAllPOIs({realm:_mSim.realm}).then(function(pois) {
            _mSim._updatePOIs(pois);
        }));

        return Promise.all(promises).then(function() {
            _mSim._map.fitBounds(_mSim._bounds);
            _mSim._map.panToBounds(_mSim._bounds);
        })['catch'](function(error) {
            console.log('<bridgeit-locations> Error: ' + ( error.message || error.responseText));
        });
    },

    /**
     * Simulate movement along a path defined by the `origin` and `destination` fields.
     */
    playSimulation: function() {
        if (!_mSim._route) {
            if (!_mSim.origin || !_mSim.destination || !_mSim.travelmode) {
                return;
            }
            _mSim._directionsService.route({
                origin:_mSim.origin,
                destination:_mSim.destination,
                travelMode: google.maps.TravelMode[_mSim.travelmode]
            }, function(response, status) {
                if (status !== google.maps.DirectionsStatus.OK) {
                    return;
                }
                _mSim._directionsRenderer.setDirections(response);

                //Use the steps of the legs instead of overview_path/polyline_path because they are the most atomic unit of a direction's route
                var legs = response.routes[0].legs;
                var route = [];
                for (var i=0;i<legs.length;i++) {
                    var steps = legs[i].steps;
                    for (var j=0;j<steps.length;j++) {
                        Array.prototype.push.apply(route, steps[j].path);
                    }
                }
                route = _mSim._processRoute(route);
                _mSim._route = route;
                var totalSecs = legs[0].distance.value / (_mSim.speed * 0.277778); //number of seconds to travel the entire route
                _mSim._totalMills = 1000 * totalSecs; //number of milliseconds to travel the entire route
                _mSim._interval = 1000 / (route.length / totalSecs); //number of milliseconds to move one point

                //Start by POSTing the initial location to the Location Service
                _mSim._index = 0;
                var location = { "location" : { "geometry" : { "type" : "Point","coordinates" : [route[_mSim._index].lng(),route[_mSim._index].lat()] } } };
                bridgeit.io.location.updateLocation({location:location}).then(function(data) {
                    var marker = new google.maps.Marker({
                        position: route[_mSim._index],
                        map: _mSim._map,
                        draggable: false, //don't allow manual location changes during simulation
                        icon: 'resources/user.png'
                    });
                    _mSim._locationMarkers.push(marker);
                    _mSim._marker = marker;
                    _mSim._location = location;
                    _mSim._location._id = data.uri.split("/").pop();
                    _mSim._updateETA(_mSim._totalMills-_mSim._interval);
                    _mSim._clickListener(marker,location,'point');
                    _mSim._doSimulation();
                }).catch(function(error) {
                    console.log('Issue updating location:',error);
                });
            });
        }
        else if (_mSim._paused) {
            _mSim._paused = false;
            _mSim._doSimulation();
        }
    },

    /**
     * Pause the simulation at it's current location along the route.
     */
    pauseSimulation: function() {
        if (!_mSim._route) {
            return;
        }
        _mSim._paused = true;
    },

    /**
     * Cancel the currently running simulation.
     */
    cancelSimulation: function() {
        if (!_mSim._route) {
            return;
        }
        _mSim._paused = true;
        _mSim._simulationFinished();
    },

    /**
     * Get the next coordinate in the simulation and send it to the Location Service. Can be used to step forwards when the simulation is paused.
     */
    nextCoordinate: function() {
        var i = _mSim._index+1; //get next coordinate
        if (!_mSim._route || !_mSim._marker || !_mSim._location || !_mSim._paused) {
            return;
        }
        var route = _mSim._route;
        _mSim._location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the next location

        bridgeit.io.location.updateLocation({location:_mSim._location}).then(function(data) {
            _mSim._marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the new location
            _mSim._map.setCenter(_mSim._marker.getPosition()); //center map on the marker
            _mSim._updateETA(_mSim._totalMills-_mSim._interval); //update the ETA
            if (i+1 >= route.length) {
                _mSim.updateLocationAtMarker();
                _mSim._simulationFinished();
                return;
            }
            _mSim._index = i;
        }).catch(function(error) {
            console.log('Issue stepping to next location of user "' + _mSim._location.username + '":', error);
        });
    },

    /**
     * Get the previous coordinate in the simulation and send it to the Location Service. Can be used to step backwards when the simulation is paused.
     */
    previousCoordinate: function() {
        var i = _mSim._index-1; //get previous coordinate
        if (!_mSim._route || !_mSim._marker || !_mSim._location || !_mSim._paused || i<0) {
            return;
        }
        var route = _mSim._route;
        _mSim._location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the previous location

        bridgeit.io.location.updateLocation({location:_mSim._location}).then(function(data) {
            _mSim._marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the new location
            _mSim._map.setCenter(_mSim._marker.getPosition()); //center map on the marker
            _mSim._updateETA(_mSim._totalMills+_mSim._interval); //update the ETA
            _mSim._index = i;
        }).catch(function(error) {
            console.log('Issue stepping to previous location of user "' + _mSim._location.username + '":', error);
        });
    },

    /**
     * Force an update of the location at it's current point in the simulation. This is in addition to the updates already being triggered by the `frequency` attribute.
     */
    updateLocationAtMarker: function() {
        if (!_mSim._location) {
            return;
        }
        bridgeit.io.location.updateLocation({location:_mSim._location}).catch(function(error) {
            console.log('Issue updating location:',error);
        });
    },


    //******************PRIVATE API******************

    /**
     * Draw regions and points of interest on the map.
     * @param data
     */
    _updateRegionsAndPOIs: function(data) {
        for (var record = 0; record < data.length; record++) {
            try {
                var location = data[record].location;
                if (!location) {
                    continue;
                }
                var geometry = location.geometry;
                if (!geometry) {
                    continue;
                }
                var type = geometry.type.toLowerCase();
                var coords = data[record].location.geometry.coordinates;
                var properties = typeof data[record].location.properties === "undefined" ? {} : data[record].location.properties;
                var googlePoint;
                if (type === "polygon") { //region
                    var region;
                    var paths = [];
                    var path = [];
                    var color = properties["Color"];
                    var metadata = typeof properties.googleMaps === "undefined" ? {} : properties.googleMaps;
                    //set the map bounds and the paths for polygon shapes
                    for (var cycle = 0; cycle < coords.length; cycle++) {
                        for (var point = 0; point < coords[cycle].length; point++) {
                            googlePoint = new google.maps.LatLng(coords[cycle][point][1], coords[cycle][point][0]);
                            path.push(googlePoint);
                            _mSim._bounds.extend(googlePoint);
                        }
                        paths.push(path);
                    }
                    if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
                        metadata.shape = "polygon";
                        region = new google.maps.Polygon({
                            'paths': paths,
                            'map': _mSim._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "circle") {
                        region = new google.maps.Circle({
                            'center': new google.maps.LatLng(metadata.center[Object.keys(metadata.center)[0]], metadata.center[Object.keys(metadata.center)[1]]),
                            'radius': metadata.radius,
                            'map': _mSim._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "rectangle") {
                        region = new google.maps.Rectangle({
                            'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
                                coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
                                coords[0][2][0])),
                            'map': _mSim._map,
                            'editable': false,
                            'fillColor': color
                        });
                    }
                    _mSim._clickListener(region,data[record],metadata.shape);
                    _mSim._regions.push(region);
                }
                else if (type === "point") { //poi
                    googlePoint = new google.maps.LatLng(coords[1], coords[0]);
                    var poi = new google.maps.Marker({
                        position: googlePoint,
                        map: _mSim._map,
                        draggable: false
                    });
                    _mSim._bounds.extend(googlePoint);
                    _mSim._clickListener(poi,data[record],type);
                    _mSim._poiMarkers.push(poi);
                }
            } catch (err) {
                console.log("Issue importing region or poi: " + JSON.stringify(data[record]), err);
            }
        }
    },

    /**
     * Draw user location markers on the map.
     */
    _updateLocations: function(locations) {
        locations.forEach(function(location) {
            var coords = location.location.geometry.coordinates;
            var latLng = new google.maps.LatLng(coords[1], coords[0]);
            _mSim._bounds.extend(latLng);
            var marker = new google.maps.Marker({
                position: latLng,
                map: _mSim._map,
                draggable: true,
                icon: 'resources/user.png'
            });
            _mSim._userLocationChangedListener(marker,location);
            _mSim._clickListener(marker,location,location.location.geometry.type.toLowerCase());
            _mSim._locationMarkers.push(marker);
        });
    },

    /**
     * Clear user locations, regions, and points of interest from the map.
     */
    _clearLocations: function() {
        _mSim._locationMarkers.forEach(function(marker) {
            marker.setMap(null);
        });
        _mSim._locationMarkers = [];

        _mSim._regions.forEach(function(region) {
            region.setMap(null);
        });
        _mSim._regions = [];

        _mSim._poiMarkers.forEach(function(poi) {
            poi.setMap(null);
        });
        _mSim._poiMarkers = [];
    },

    /**
     * Draw regions on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param regions
     */
    _updateRegions: function(regions) {
        _mSim._updateRegionsAndPOIs(regions);
    },

    /**
     * Draw points of interest on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param pois
     */
    _updatePOIs: function(pois) {
        _mSim._updateRegionsAndPOIs(pois);
    },

    /**
     * Calculate more fine-grained coordinates than what is provided by the Google Maps API.
     * @param route
     * @private
     */
    _processRoute: function(route) {
        var newRoute = route.slice(0);

        for (var i=0; i<route.length; i++) {
            //nothing to do if we're at the last coordinate
            if (i+1 >= route.length) {
                break;
            }
            //convert current and next lat/lng to radians for calculation
            var lat1 = toRadians(route[i].lat());
            var lng1 = toRadians(route[i].lng());
            var lat2 = toRadians(route[i+1].lat());
            var lng2 = toRadians(route[i+1].lng());
            //used to determine when to stop adding coordinates between the ones provided by Google
            var latOp = lat1 < lat2 ? '<' : '>';
            var lngOp = lng1 < lng2 ? '<' : '>';

            (function addCoordinates(lat1, lng1) {
                //calculate bearing from [lat1,lng1] to [lat2,lng2]
                var y = Math.sin(lng2-lng1) * Math.cos(lat2);
                var x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*Math.cos(lat2)*Math.cos(lng2-lng1);
                var bearing = Math.atan2(y, x);

                //calculate next point, x meters from current point towards next point
                var dist = 2; //2 meters
                var eRadius = 6371000; //earth's mean radius in meters
                var lat = Math.asin(Math.sin(lat1)*Math.cos(dist/eRadius) +
                          Math.cos(lat1)*Math.sin(dist/eRadius)*Math.cos(bearing));
                var lng = lng1 + Math.atan2(Math.sin(bearing)*Math.sin(dist/eRadius)*Math.cos(lat1),
                          Math.cos(dist/eRadius)-Math.sin(lat1)*Math.sin(lat2));

                if ( !((compare(latOp,lat,lat2)) && (compare(lngOp,lng,lng2))) ) {
                    return false; //we've reached the next point so stop adding coordinates for this iteration
                }
                newRoute.splice(i+1+(newRoute.length-route.length), 0, new google.maps.LatLng(toDegrees(lat),toDegrees(lng))); //add the new coordinates
                addCoordinates(lat, lng);
            })(lat1, lng1);
        }
        return newRoute;

        //used to compare lat or long values with a dynamic operator
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
     * @param route
     * @private
     */
     _doSimulation: function() {
        _mSim._updateOnFrequency();
        var route = _mSim._route;
        var i = _mSim._index+1; //get next coordinate
        var interval = _mSim._interval;
        var location = _mSim._location;
        var marker = _mSim._marker;
        location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the next location
        var updatePosition = setInterval(function() {
            _mSim._updateETA(_mSim._totalMills-interval); //update the ETA
            marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //update the marker position
            _mSim._map.setCenter(marker.getPosition()); //center map on the marker
            _mSim._map.setZoom(18); //set map zoom
            if (_mSim._paused) {
                _mSim._index = i;
                clearInterval(updatePosition);
                return;
            }
            if (i+1 >= route.length) {
                _mSim.updateLocationAtMarker();
                _mSim._simulationFinished();
                clearInterval(updatePosition);
                return;
            }
            i++;
            location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //get the next location
        },interval);
    },

    /**
     * Handles updating the location in the Location Service during simulation. The `frequency` attribute determines how often the location is updated on the server.
     * @private
     */
    _updateOnFrequency: function() {
        var updateLocation = setInterval(function() {
            if (_mSim._paused || !_mSim._location) {
                clearInterval(updateLocation);
                return;
            }
            bridgeit.io.location.updateLocation({location:_mSim._location}).catch(function(error) {
                console.log('Issue updating location:',error);
            });
        },_mSim.frequency*1000);
    },

    /**
     * Keep the ETA updated when moving along a route during simulation.
     * @param mills
     * @private
     */
    _updateETA: function(mills) {
        _mSim._totalMills = mills;
        _mSim._eta = new Date(_mSim._totalMills).toISOString().substr(11, 12);
        if (_mSim._eta === '00:00:00.000') {
            _mSim._eta = null;
            _mSim._totalMills = 0;
        }
    },

    /**
     * After the simulation is complete submit the final position to the Location Service, remove the directions overlay and allow the marker to be dragged.
     * @param marker
     * @param location
     * @private
     */
    _simulationFinished: function() {
        _mSim._marker.setDraggable(true);
        _mSim._userLocationChangedListener(_mSim._marker,_mSim._location);
        _mSim._directionsRenderer.set('directions', null);
        _mSim._route = null;
        _mSim._index = 0;
        _mSim._interval = 0;
        _mSim._marker = null;
        _mSim._location = null;
        _mSim._eta = null;
        _mSim._totalMills = 0;

    },

    /**
     * When a map overlay is clicked display an infoWindow with some relative information.
     * @param overlay
     * @param location
     * @param shape
     * @private
     */
    _clickListener: function(overlay,location,shape) {
        google.maps.event.addListener(overlay, 'click', function () {
            var name = location.label || location._id;
            _mSim._infoWindow.setContent('<div style="overflow:auto;font-weight:bold;">'+name+'</div>');
            if (shape === "polygon") {
                _mSim._infoWindow.setPosition(overlay.getPath().getAt(0));
            }
            else if (shape === "circle") {
                _mSim._infoWindow.setPosition(overlay.getCenter());
            }
            else if (shape === "rectangle") {
                _mSim._infoWindow.setPosition(overlay.getBounds().getNorthEast());
            }
            else { //shape === "point"
                _mSim._infoWindow.setPosition(overlay.getPosition());
                var username = location.username ? location.username+'<br/>' : '';
                var date = location.lastUpdated ? new Date(location.lastUpdated).toLocaleString() : '';
                _mSim._infoWindow.setContent('<div style="overflow:auto;font-weight:bold;">'+name+'<br/>'+username+date+'</div>');
            }
            _mSim._infoWindow.open(_mSim._map,overlay);
        });
    },

    /**
     * When a user is dragged to a new location on the map update their location in the Location Service.
     * @param marker
     * @param location
     * @private
     */
    _userLocationChangedListener: function(marker,location) {
        google.maps.event.addListener(marker, "dragend", function (event) {
            location.location.geometry.coordinates = [marker.getPosition().lng(), marker.getPosition().lat()];
            bridgeit.io.location.updateLocation({location: location}).catch(function (error) {
                console.log('Issue changing location of user "' + location.username + '":', error);
            });
        });
    },

    /**
     * When a new user is dropped on the map save them to the Location Service and setup required listeners.
     * @param drawingManager
     * @private
     */
    _newUserLocationListener: function(drawingManager) {
        google.maps.event.addListener(drawingManager, 'markercomplete', function (marker) {
            var location = { "location" : { "geometry" : { "type" : "Point", "coordinates" : [marker.getPosition().lng(),marker.getPosition().lat()] } } };
            bridgeit.io.location.updateLocation({location:location}).then(function(data) {
                _mSim._userLocationChangedListener(marker,location);
                _mSim._clickListener(marker,location,location.location.geometry.type.toLowerCase());
                _mSim._locationMarkers.push(marker);
            }).catch(function(error) {
                console.log('Issue creating new location:',error);
            });
        });
    },

    /**
     * Ensure that the `origin` and `destination` attributes are set when a location is selected in the autocompletes.
     * @param input
     * @private
     */
    _autocompleteListener: function(input) {
        google.maps.event.addListener(input, 'place_changed', function() {
            _mSim.origin = _mSim.$$("#origin").value;
            _mSim.destination = _mSim.$$("#destination").value;
        });
    },

    /**
     * Validates the `travelmode` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _travelModeValidation: function(newVal,oldVal) {
        var validModes = ['DRIVING','BICYCLING','WALKING','TRANSIT'];
        newVal = newVal.toUpperCase();

        if (validModes.indexOf(newVal) == -1) {
            if (validModes.indexOf(oldVal) > -1) {
                _mSim.travelmode = oldVal;
                return;
            }
            _mSim.travelmode = 'DRIVING';
            return;
        }
        _mSim.travelmode = newVal;
    },

    /**
     * Validates the `speed` attribute. If invalid, the old value, or the default will be used.
     * @param newVal
     * @param oldVal
     * @private
     */
    _speedValidation: function(newVal,oldVal) {
        if (isNaN(newVal) || newVal <= 0) {
            _mSim.speed = oldVal || 50;
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
            _mSim.frequency = oldVal || 5;
        }
    }
});