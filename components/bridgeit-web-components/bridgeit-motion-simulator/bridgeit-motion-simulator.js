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
         * Flag indicating if the `origin`, `destination` and `travelmode` inputs should be rendered. Alternatively, these can be set directly using the attributes.
         */
        inputs: { type: Boolean, value: false},
        /**
         * Flag indicating if the simulation navigation buttons should be rendered. Alternatively, the simulation functions can be accessed directly.
         */
        buttons: { type: Boolean, value: false},
        /**
         * The starting point of the simulation, represented as an address or coordinate.
         */
        origin: { type: String, value: ''},
        /**
         * The ending point of the simulation, represented as an address or coordinate.
         */
        destination: { type: String, value: ''},
        /**
         * The routing type between `origin` and `destination`. Available options are `DRIVING`, `BICYCLING`, `WALKING` or `TRANSIT`.
         */
        travelmode: { type: String, value: 'DRIVING', observer: '_travelModeValidation'}
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
        if (typeof google === 'undefined' || !_mSim.realm || !_mSim.account) {
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

        return Promise.all(promises).then(function(){
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
        _mSim._paused = false;
        if (!_mSim._directionsRenderer.getDirections()) {
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
                var route = response.routes[0].overview_path;

                //POST first location so we can have an ID to use for subsequent requests
                _mSim._sim_index = 0;
                var location = { "location" : { "geometry" : { "type" : "Point","coordinates" : [route[_mSim._sim_index].lng(),route[_mSim._sim_index].lat()] } } };
                bridgeit.io.location.updateLocation({location:location}).then(function(data) {
                    var marker = new google.maps.Marker({
                        position: route[_mSim._sim_index],
                        map: _mSim._map,
                        draggable: false, //don't allow manual location changes during simulation
                        icon: 'resources/user.png'
                    });
                    _mSim._sim_marker = marker;
                    location._id = data.uri.split("/").pop();
                    _mSim._sim_location = location;
                    _mSim._clickListener(marker,location,'point');
                    _mSim._doSimulation(route);
                }).catch(function(error){
                    console.log('Issue creating new location:',error);
                });
            });
        }
        else {
            _mSim._doSimulation(_mSim._directionsRenderer.getDirections().routes[0].overview_path);
        }
    },

    /**
     * Pause the simulation at it's current location along the route.
     */
    pauseSimulation: function() {
        _mSim._paused = true;
    },

    /**
     * Get the next coordinate in the simulation. Can be used to step forwards when the simulation is paused.
     */
    nextCoordinate: function() {
        var marker = _mSim._sim_marker;
        var location = _mSim._sim_location;
        var i = _mSim._sim_index+1; //get next coordinate
        if (!_mSim._directionsRenderer.getDirections() || !marker || !location || !_mSim._paused) {
            return;
        }
        var route = _mSim._directionsRenderer.getDirections().routes[0].overview_path;
        location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //POST the next location

        bridgeit.io.location.updateLocation({location:location}).then(function(data) {
            marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the current location in the Location Service
            if (i+1 >= route.length) {
                _mSim._simulationFinished(marker,location);
                return;
            }
            _mSim._sim_index = i;
            _mSim._sim_marker = marker;
            _mSim._sim_location = location;
        }).catch(function(error){
            console.log('Issue stepping to next location of user "' + location.username + '":', error);
        });
    },

    /**
     * Get the previous coordinate in the simulation. Can be used to step backwards when the simulation is paused.
     */
    previousCoordinate: function() {
        var marker = _mSim._sim_marker;
        var location = _mSim._sim_location;
        var i = _mSim._sim_index-1; //get previous coordinate
        if (!_mSim._directionsRenderer.getDirections() || !marker || !location || !_mSim._paused || i<0) {
            return;
        }
        var route = _mSim._directionsRenderer.getDirections().routes[0].overview_path;
        location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //POST the previous location

        bridgeit.io.location.updateLocation({location:location}).then(function(data) {
            marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //move the marker to the current location in the Location Service
            _mSim._sim_index = i;
            _mSim._sim_marker = marker;
            _mSim._sim_location = location;
        }).catch(function(error){
            console.log('Issue stepping to previous location of user "' + location.username + '":', error);
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
     * Wrapper for recursive function that handles continuous playing of the simulation.
     * @param route
     * @private
     */
    _doSimulation: function(route) {
        var updateLocation = function(location) {
            bridgeit.io.location.updateLocation({location:location}).then(function(data) {
                marker.setPosition({lat:route[i].lat(),lng:route[i].lng()}); //update the marker to the current location in the Location Service
                if (_mSim._paused) {
                    _mSim._sim_index = i;
                    _mSim._sim_marker = marker;
                    _mSim._sim_location = location;
                    return;
                }
                if (i+1 >= route.length) {
                    _mSim._simulationFinished(marker,location);
                    return;
                }
                i++;
                location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //set location to POST to the next location
                updateLocation(location);
            }).catch(function(error){
                console.log('Issue changing location of user "' + location.username + '":', error);
            });
        };

        var i = _mSim._sim_index+1; //get next coordinate
        var location = _mSim._sim_location;
        var marker = _mSim._sim_marker;
        location.location.geometry.coordinates = [route[i].lng(),route[i].lat()]; //POST the next location
        updateLocation(location);
    },

    /**
     * After the simulation is complete remove the directions overlay and allow the marker to be dragged.
     * @param marker
     * @param location
     * @private
     */
    _simulationFinished: function(marker,location) {
        marker.setDraggable(true);
        _mSim._userLocationChangedListener(marker,location);
        _mSim._directionsRenderer.set('directions', null);
        _mSim._sim_index = 0;
        _mSim._sim_marker = null;
        _mSim._sim_location = null;
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
                location._id = data.uri.split("/").pop();
                _mSim._userLocationChangedListener(marker,location);
                _mSim._clickListener(marker,location,location.location.geometry.type.toLowerCase());
            }).catch(function(error){
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
     * Validates the `travelmode` property. If invalid use the old routing value or `DRIVING`.
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
    }
});
