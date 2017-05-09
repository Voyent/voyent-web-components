Polymer({
	is: "voyent-locations",

    properties: {
        /**
         * Defines the Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the Voyent realm to request location data for.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String, observer: '_realmChanged' },
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

    /**
     * Reset our various properties upon creation
     */
	created: function() {
        this._map = null;
		this._locationMarkers = [];
        this._regions = [];
        this._poiMarkers = [];
		this._bounds = null;
	},

	/**
	 * Initialize our map once the page is ready
	 */
	ready: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        var _this = this;
		//initialize google maps
		window.initializeLocationsMap = function() {
			var mapOptions = {
				zoom: 8,
				center: new google.maps.LatLng(51.067799, -114.085237),
				signed_in: false
			};
			_this._map = new google.maps.Map(_this.$.map, mapOptions);
			_this._bounds = new google.maps.LatLngBounds();

			if (voyent.io.auth.isLoggedIn()) {
				_this.refreshMap();
			}
            //make sure the map is sized correctly for the view
            setTimeout(function() {
                google.maps.event.trigger(_this._map, "resize");
            },100);
		};
		if( !('google' in window) || !('maps' in window.google)){
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAZVsIO4CmSqqE7qbSO8pB0JPVUkO5bOd8&v=3.27&' +
                'libraries=places,geometry,visualization,drawing&callback=initializeLocationsMap';
            this.$.container.appendChild(script);
        }
        else{
            initializeLocationsMap();
        }
	},

    /**
     * Retrieve the latest data from the Location Service and refresh the map.
     * @returns {*}
     */
	refreshMap: function() {
        var _this = this;
		if (typeof google === 'undefined' || !this.realm || !this.account) {
            return;
        }
        this._clearLocations();
        this._bounds = new google.maps.LatLngBounds();
        var promises = [];
        if( this.showuserlocations ){
            promises.push(voyent.io.locate.findLocations({realm:_this.realm}).then(function(locationUpdates) {
                _this._updateLocations(locationUpdates);
            }));
        }
        if( this.showregions ){
            promises.push(voyent.io.locate.getAllRegions({realm:_this.realm}).then(function(regions) {
                _this._updateRegions(regions);
            }));
        }
        if( this.showpois ){
            promises.push(voyent.io.locate.getAllPOIs({realm:_this.realm}).then(function(pois) {
                _this._updatePOIs(pois);
            }));
        }

        return Promise.all(promises).then(function(){
            _this._map.fitBounds(_this._bounds);
            _this._map.panToBounds(_this._bounds);
        })['catch'](function(error) {
            _this.fire('message-error', 'Error refreshing map: ' + error);
            console.error('Error refreshing map:',error);
        });
	},


    //******************PRIVATE API******************

    /**
     * Draw regions and points of interest on the map.
     * @param data
     */
    _updateRegionsAndPOIs: function(data){
        var _this = this;
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
                    var color = properties.Color;
                    var metadata = typeof properties.googleMaps === "undefined" ? {} : properties.googleMaps;
                    //set the map bounds and the paths for polygon shapes
                    for (var cycle = 0; cycle < coords.length; cycle++) {
                        for (var point = 0; point < coords[cycle].length; point++) {
                            googlePoint = new google.maps.LatLng(coords[cycle][point][1], coords[cycle][point][0]);
                            path.push(googlePoint);
                            this._bounds.extend(googlePoint);
                        }
                        paths.push(path);
                    }
                    if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
                        metadata.shape = "polygon";
                        region = new google.maps.Polygon({
                            'paths': paths,
                            'map': this._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "circle") {
                        region = new google.maps.Circle({
                            'center': new google.maps.LatLng(metadata.center[Object.keys(metadata.center)[0]], metadata.center[Object.keys(metadata.center)[1]]),
                            'radius': metadata.radius,
                            'map': this._map,
                            'editable': false,
                            'fillColor': color
                        });
                    } else if (metadata.shape === "rectangle") {
                        region = new google.maps.Rectangle({
                            'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
                                coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
                                coords[0][2][0])),
                            'map': this._map,
                            'editable': false,
                            'fillColor': color
                        });
                    }
                    this._regions.push(region);
                } else if (type === "point") { //poi
                    googlePoint = new google.maps.LatLng(coords[1], coords[0]);
                    var poi = new google.maps.Marker({
                        position: googlePoint,
                        map: this._map,
                        draggable: false
                    });
                    this._bounds.extend(googlePoint);
                    this._poiMarkers.push(poi);
                }
            } catch (err) {
                _this.fire('message-error', "Issue importing region or poi: " + JSON.stringify(data[record]));
                console.error('Issue importing region or poi:',JSON.stringify(data[record]));
            }
        }
    },

    /**
     * Draw user location markers on the map.
     */
    _updateLocations: function(locations) {
        var _this = this;
        if (!this._map) {
            this.fire('message-error', 'Locations could not update map markers due to missing map');
            console.error('Locations could not update map markers due to missing map');
            return;
        }
        locations.forEach(function(locationUpdate) {
            var coords = locationUpdate.location.geometry.coordinates;
            var latlon = new google.maps.LatLng(coords[1], coords[0]);
            _this._bounds.extend(latlon);
            var marker = new google.maps.Marker({
                position: latlon,
                map: _this._map,
                title: locationUpdate.username + ' ' +
                new Date(locationUpdate.lastUpdated).toLocaleString()
            });
            _this._locationMarkers.push(marker);
        });
    },

    /**
     * Clear user location updates, regions, and points of interest from the map.
     */
    _clearLocations: function() {
        this._locationMarkers.forEach(function(marker) {
            marker.setMap(null);
        });
        this._locationMarkers = [];

        this._regions.forEach(function(region) {
            region.setMap(null);
        });
        this._regions = [];

        this._poiMarkers.forEach(function(poi) {
            poi.setMap(null);
        });
        this._poiMarkers = [];
    },

    /**
     * Draw regions on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param regions
     */
    _updateRegions: function(regions) {
        this._updateRegionsAndPOIs(regions);
    },

    /**
     * Draw points of interest on the map (wrapper for `_updateRegionsAndPOIs`).
     * @param pois
     */
    _updatePOIs: function(pois) {
        this._updateRegionsAndPOIs(pois);
    },

    /**
     * Refresh the map when the `realm` attribute changes.
     * @private
     */
    _realmChanged: function() {
        this.refreshMap();
    },

    /**
     * Refresh the map when the `showUserLocations` attribute changes.
     * @private
     */
    _showUserLocationsChanged: function() {
        this.refreshMap();
    },

    /**
     * Refresh the map when the `showRegions` attribute changes.
     * @private
     */
    _showRegionsChanged: function() {
        this.refreshMap();
    },

    /**
     * Refresh the map when the `showPOIs` attribute changes.
     * @private
     */
    _showPOIsChanged: function() {
        this.refreshMap();
    }
});