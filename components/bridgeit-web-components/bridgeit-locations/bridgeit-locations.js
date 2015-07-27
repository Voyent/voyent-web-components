var _locations;

Polymer({
	is: "bridgeit-locations",

    properties: {
        /**
         * Required to authenticate with BridgeIt.
         * @default bridgeit.io.auth.getLastAccessToken()
         */
        accesstoken: { type: String, value: bridgeit.io.auth.getLastAccessToken() },
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() },
        /**
         * Defines the BridgeIt realm to request location data for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: bridgeit.io.auth.getLastKnownRealm(), observer: '_realmChanged' },
        /**
         * Whether to show the user location updates for the realm.
         */
        showuserlocations: { type: Boolean, value: false, observer: '_showUserLocationsChanged' },
        /**
         * Whether to show the regions for the realm.
         */
        showregions: { type: Boolean, value: false, observer: '_showRegionsChanged' },
        /**
         * Whether to show points of interest for the realm.
         */
        showpois: { type: Boolean, value: false, observer: '_showPOIsChanged' }
    },

	created: function() {
        _locations = this;
        _locations._map = null;
		_locations._locationMarkers = [];
        _locations._regions = [];
        _locations._poiMarkers = [];
		_locations._bounds = null;
	},

	ready: function() {
		//initialize google maps
		window.initializeLocationsMap = function() {
			var mapOptions = {
				zoom: 8,
				center: new google.maps.LatLng(51.067799, -114.085237),
				signed_in: false
			};
			_locations._map = new google.maps.Map(_locations.$.map, mapOptions);
			_locations._bounds = new google.maps.LatLngBounds();

			if (_locations.accessToken) {
				_locations.refreshMap();
			}
		};
		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = 'https://maps.googleapis.com/maps/api/js?v=3.exp&' +
			'libraries=places,geometry,visualization&callback=initializeLocationsMap';
		_locations.$.container.appendChild(script);
	},

    /**
     * Retrieve the latest data from the Location Service and refresh the map.
     * @returns {*}
     */
	refreshMap: function() {
		if (typeof google === 'undefined' || !_locations.realm || !_locations.account) {
            return;
        }
        _locations._clearLocations();
        _locations._bounds = new google.maps.LatLngBounds();
        var promises = [];
        if( _locations.showuserlocations ){
            promises.push(bridgeit.io.location.findLocations({realm:_locations.realm}).then(function(locationUpdates) {
                _locations._updateLocations(locationUpdates);
            }));
        }
        if( _locations.showregions ){
            promises.push(bridgeit.io.location.getAllRegions({realm:_locations.realm}).then(function(regions) {
                _locations._updateRegions(regions);
            }));
        }
        if( _locations.showpois ){
            promises.push(bridgeit.io.location.getAllPOIs({realm:_locations.realm}).then(function(pois) {
                _locations._updatePOIs(pois);
            }));
        }

        return Promise.all(promises).then(function(){
            _locations._map.fitBounds(_locations._bounds);
            _locations._map.panToBounds(_locations._bounds);
        })['catch'](function(error) {
            console.log('<bridgeit-locations> Error: ' + ( error.message || error.responseText));
        });
	},


    //******************PRIVATE API******************

    /**
     * Draw regions and points of interest on the map.
     * @param data
     */
    _updateRegionsAndPOIs: function(data){
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
                            _locations._bounds.extend(googlePoint);
                        }
                        paths.push(path);
                    }
                    if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
                        metadata.shape = "polygon";
                        region = new google.maps.Polygon({
                            'paths': paths,
                            'map': _locations._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "circle") {
                        region = new google.maps.Circle({
                            'center': new google.maps.LatLng(metadata.center[Object.keys(metadata.center)[0]], metadata.center[Object.keys(metadata.center)[1]]),
                            'radius': metadata.radius,
                            'map': _locations._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "rectangle") {
                        region = new google.maps.Rectangle({
                            'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
                                coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
                                coords[0][2][0])),
                            'map': _locations._map,
                            'editable': false,
                            'fillColor': color
                        });
                    }
                    _locations._regions.push(region);
                } else if (type === "point") { //poi
                    googlePoint = new google.maps.LatLng(coords[1], coords[0]);
                    var poi;
                    poi = new google.maps.Marker({
                        position: googlePoint,
                        map: _locations._map,
                        draggable: editable
                    });
                    _locations._bounds.extend(googlePoint);
                    _locations._poiMarkers.push(poi);
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
        if (!_locations._map) {
            console.log('ERROR: locations could not update map markers due to missing map');
            return;
        }
        locations.forEach(function(locationUpdate) {
            var coords = locationUpdate.location.geometry.coordinates;
            var latlon = new google.maps.LatLng(coords[1], coords[0]);
            _locations._bounds.extend(latlon);
            var marker = new google.maps.Marker({
                position: latlon,
                map: _locations._map,
                title: locationUpdate.username + ' ' +
                new Date(locationUpdate.lastUpdated).toLocaleString()
            });
            _locations._locationMarkers.push(marker);
        });
    },

    /**
     * Clear user location updates, regions, and points of interest from the map.
     */
    _clearLocations: function() {
        _locations._locationMarkers.forEach(function(marker) {
            marker.setMap(null);
        });
        _locations._locationMarkers = [];

        _locations._regions.forEach(function(region) {
            region.setMap(null);
        });
        _locations._regions = [];

        _locations._poiMarkers.forEach(function(poi) {
            poi.setMap(null);
        });
        _locations._poiMarkers = [];
    },

    /**
     * Draw regions on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param regions
     */
    _updateRegions: function(regions) {
        _locations._updateRegionsAndPOIs(regions);
    },

    /**
     * Draw points of interest on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param pois
     */
    _updatePOIs: function(pois) {
        _locations._updateRegionsAndPOIs(pois);
    },

    /**
     * Refresh the map when the `realm` attribute changes.
     * @private
     */
    _realmChanged: function() {
        _locations.refreshMap();
    },

    /**
     * Refresh the map when the `showUserLocations` attribute changes.
     * @private
     */
    _showUserLocationsChanged: function() {
        _locations.refreshMap();
    },

    /**
     * Refresh the map when the `showRegions` attribute changes.
     * @private
     */
    _showRegionsChanged: function() {
        _locations.refreshMap();
    },

    /**
     * Refresh the map when the `showPOIs` attribute changes.
     * @private
     */
    _showPOIsChanged: function() {
        _locations.refreshMap();
    }
});