var _this;

Polymer({

	/**
	 * The `accessToken` attribute is required to authenticate with BridgeIt
	 *
	 * @attribute accessToken
	 * @type string
	 * @default 'bridgeit.io.auth.getLastAccessToken()'
	 */
	accessToken: bridgeit.io.auth.getLastAccessToken(),

	/**
	 * The `realm` attribute defines the BridgeIt realm to request locations for.
	 *
	 * @attribute realm
	 * @type string
	 * @default 'bridgeit.io.auth.getLastKnownRealm()'
	 */
	realm: bridgeit.io.auth.getLastKnownRealm(),

	/**
	 * The `account` attribute defines the BridgeIt account of the realm.
	 *
	 * @attribute account
	 * @type string
	 * @default 'bridgeit.io.auth.getLastKnownAccount()'
	 */
	account: bridgeit.io.auth.getLastKnownAccount(),

	/* Whether to show the user location updates for the realm.
	 *
	 * @attribute showUserLocations
	 * @type boolean
	 * @default true
	 */
	showUserLocations: true,

	/* Whether to show the regions for the realm.
	 *
	 * @attribute showRegions
	 * @type boolean
	 * @default false
	 */
	showRegions: false,

	/* Whether to show points of interest for the realm.
	 *
	 * @attribute showPOIs
	 * @type boolean
	 * @default false
	 */
	showPOIs: false,

	/* The height of the map
	 *
	 * @attribute height
	 * @type string
	 * @default '200px'
	 */
	height: '200px',



	locationUpdates: [],
	regions: [],
	mapMarkers: [],
	map: null,
	bounds: null,

	created: function(){
		
	},

	ready: function() {
		_this = this;

		//load gmap script
		window.initializeLocationsMap = function() {
			var mapElem = _this.$.map;
			mapElem.style.height = _this.height;
			mapElem.style.width = '100%';
			var mapOptions = {
				zoom: 8,
				center: new google.maps.LatLng(-34.397, 150.644),
				maxZoom: 12,
				signed_in: false
			};

			_this.map = new google.maps.Map(mapElem, mapOptions);
			_this.bounds = new google.maps.LatLngBounds();

			_this.initAuthorization();

			if (_this.accessToken) {
				_this.refreshMap();
			}
		};

		var script = document.createElement('script');
		script.type = 'text/javascript';
		script.src = 'https://maps.googleapis.com/maps/api/js?v=3.exp&' +
			'libraries=places,geometry,visualization&callback=initializeLocationsMap';
		_this.$.container.appendChild(script);

	},

	initAuthorization: function() {

		if (!_this.account) {
			_this.account = bridgeit.io.auth.getLastKnownAccount();
		}

		if (!_this.realm) {
			_this.realm = bridgeit.io.auth.getLastKnownRealm();
		}
		if (!_this.accessToken) {
			_this.accessToken = bridgeit.io.auth.getLastAccessToken();
		}

		//TODO see why lib is returning strings
		if (_this.account === 'null' || _this.account === 'undefined') {
			_this.account = null;
		}
		if (_this.realm === 'null' || _this.realm === 'undefined') {
			_this.realm = null;
		}
		if (_this.accessToken === 'null' || _this.accessToken === 'undefined') {
			_this.accessToken = null;
		}
	},

	clearMapMarkers: function() {
		_this.mapMarkers.forEach(function(marker) {
			marker.setMap(null);
		});
		_this.mapMarkers = [];
	},

	realmChanged: function() {
		_this.refreshMap();
	},

	showRegionsChanged: function(){
		_this.refreshMap();
	},

	showUserLocationsChanged: function(){
		_this.refreshMap();
	},

	showPOIsChanged: function(){
		_this.refreshMap();
	},

	heightChanged: function(){
		_this.$.map.style.height = _this.height;
		_this.refreshMap();
	},

	refreshMap: function() {
		if (_this.realm && _this.account) {
			_this.clearMapMarkers();
			_this.bounds = new google.maps.LatLngBounds();
			var promises = [];
			if( _this.showUserLocations ){
				promises.push(bridgeit.io.location.findLocations({realm: _this.realm}).then(function(locationUpdates) {
					_this.locationUpdates = locationUpdates;
					_this.updateMapMarkers();
				}));
			}
			if( _this.showRegions ){
				promises.push(bridgeit.io.location.getAllRegions({realm: _this.realm}).then(function(regions) {
					_this.updateRegions(regions);
				}));
			}
			if( _this.showPOIs ){
				promises.push(bridgeit.io.location.getAllPOIs({realm: _this.realm}).then(function(pois) {
					_this.updatePOIs(pois);
				}));
			}

			return Promise.all(promises).then(function(){
				_this.map.fitBounds(_this.bounds);
				_this.map.panToBounds(_this.bounds);
			})['catch'](function(error) {
				console.log('<bridgeit-locations> Error: ' + ( error.message || error.responseText));
			});
		}
	},

	updateMapMarkers: function() {
		if (!_this.map) {
			console.log('ERROR: locations could not update map markers due to missing map');
			return;
		}

		if (_this.locationUpdates && _this.locationUpdates.length > 0) {
			_this.locationUpdates.forEach(function(locationUpdate) {
				var coords = locationUpdate.location.geometry.coordinates;
				var latlon = new google.maps.LatLng(coords[1], coords[0]);
				_this.bounds.extend(latlon);
				var marker = new google.maps.Marker({
					position: latlon,
					map: _this.map,
					title: locationUpdate.username + ' ' +
						new Date(locationUpdate.lastUpdated).toLocaleString()
				});
				_this.mapMarkers.push(marker);
			});
			
		}
	},

	renderLocations: function(data){
		for (var record = 0; record < data.length; record++) {
			try {
				var location = data[record].location;
				if( !location ){
					continue;
				}
				var geometry = location.geometry;
				if( !geometry ){
					continue;
				}
				var type = geometry.type.toLowerCase();
				var coords = data[record].location.geometry.coordinates;
				var properties = typeof data[record].location.properties === "undefined" ? {} : data[record].location.properties;
				var editable = typeof properties["Editable"] === "undefined" ?
					true : properties["Editable"];
				var googlePoint;
				var geoJSON;
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
							_this.bounds.extend(googlePoint);
						}
						paths.push(path);
					}
					if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
						metadata.shape = "polygon";
						region = new google.maps.Polygon({
							'paths': paths,
							'map': _this.map,
							'editable': editable,
							'fillColor': color
						});
					} else if (metadata.shape === "circle") {
						region = new google.maps.Circle({
							'center': new google.maps.LatLng(metadata.center[Object.keys(metadata.center)[0]], metadata.center[Object.keys(metadata.center)[1]]),
							'radius': metadata.radius,
							'map': _this.map,
							'editable': editable,
							'fillColor': color
						});
					} else if (metadata.shape === "rectangle") {
						region = new google.maps.Rectangle({
							'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
								coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
								coords[0][2][0])),
							'map': _this.map,
							'editable': editable,
							'fillColor': color
						});
					}
					geoJSON = data[record];
					properties["googleMaps"] = metadata;
					geoJSON.location.properties = properties;
					if (!geoJSON.label) {
						geoJSON.label = geoJSON._id;
					}
				} else if (type === "point") { //poi
					googlePoint = new google.maps.LatLng(coords[1], coords[0]);
					var poi;
					poi = new google.maps.Marker({
						position: googlePoint,
						map: _this.map,
						draggable: editable
					});
					_this.bounds.extend(googlePoint);
					geoJSON = data[record];
					if (!geoJSON.label) {
						geoJSON.label = geoJSON._id;
					}
				}
			} catch (err) {
				console.log("Issue importing region or poi: " + JSON.stringify(data[record]), err);
			}
		}
	},

	updatePOIs: function(pois){
		_this.renderLocations(pois);
	},

	updateRegions: function(regions){
		_this.renderLocations(regions);
	}
});
