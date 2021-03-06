Polymer({
    is: "voyent-location-simulator",
    behaviors: [Voyent.LocationBehavior],

    properties: {
        /**
         * The Voyent account of the realm.
         * @default voyent.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The Voyent realm to simulate motion in.
         * @default voyent.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * The document collection to be used for CRUD operations on simulations.
         */
        collection: { type: String, value: 'simulator-routes' },
        /**
         * The relative path to the `images` resource directory. This may be
         * necessary when using the component as part of a custom build.
         */
        pathtoimages: { type: String, value: '.', observer: '_pathtoimagesChanged' },
        /**
         * The number of pixels to offset the origin/destination context and tracker instance selection menus from the
         * top. This may be necessary to use if there are parent elements of the component with significant margins,
         * padding or borders. A positive number moves the menu position down and vise versa.
         */
        menuoffsettop: { type: Number, value: 0 },
        /**
         * The number of pixels to offset the origin/destination context and tracker instance selection menus from the
         * left. This may be necessary to use if there are parent elements of the component with significant margins,
         * padding or borders. A positive number moves the menu position right and vise versa.
         */
        menuoffsetleft: { type: Number, value: 0 },
        /**
         * Height and width of the google map to be created, as an integer. If left empty, values will default to height/width of the parent container.
         * If a height cannot be found from those calculations, a default minimum of 300 will be used
         */
        height: Number,
        width: Number,
        /**
         * Enable a percent of the full page height to automatically fill with the map
         * To disable use a value of -1
         * Otherwise something like 0.8 corresponds to 80% of the page height. 1.2 would be 120%, etc. Basically height = "h*autoheight"
         */
        autoheight: { type: Number, value: -1, notify: true }
    },

    /**
     * Fired after the Google Map has been initialized. Contains the map object.
     * @event mapInitialized
     */
    /**
     * Fired when the realm users are retrieved. Contains the list of users.
     * @event usersRetrieved
     */
    /**
     * Fired when the simulations are retrieved. Contains the list of saved simulations in the specified collection.
     *
     * @event simulationsRetrieved
     */

    ready: function() {
        if (!this.realm) {
            this.realm = voyent.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.auth.getLastKnownAccount();
        }
        var _this = this;
        //set some default values
        this._locationMarkers = {}; //mapping of location markers (user markers mapped to username, tracker markers mapped to trackerId.zoneNamespace)
        this._regions = []; //list of regions (regular regions + tracker zones)
        this._pointMarkers = []; //list of pois
        this._trackerInstances = {}; //mapping of tracker instances
        this._activeSim = null; //currently active/loaded simulation
        this._children = []; //list of child components (location-route, location-vector) and related tab info
        this._hideContextMenu = this._contextMenuDisabled = this._hideIncidentMenu =  this._hideUserMenu = true;
        //initialize google maps
        window.initializeLocationsMap = function () {
            _this._map = new google.maps.Map(_this.$.map, {
                zoom: 8,
                center: new google.maps.LatLng(51.08427,-114.13062),
                streetViewControl: false,
                mapTypeControlOptions: {
                    style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                zoomControlOptions: {
                    style: google.maps.ZoomControlStyle.LARGE,
                    position: google.maps.ControlPosition.LEFT_CENTER
                }
            });
            _this.fire('mapInitialized', {map: _this._map});
            _this._calcMapSize();
            _this._bounds = new google.maps.LatLngBounds();
            //setup ui and listener for manually adding new location markers
            var drawingManager = new google.maps.drawing.DrawingManager({
                drawingControlOptions: {
                    position: google.maps.ControlPosition.TOP_RIGHT,
                    drawingModes: []
                },
                markerOptions: {draggable: true}
            });
            drawingManager.setMap(_this._map);
            _this._drawingManager = drawingManager;
            _this._setupNewLocationListener(drawingManager);
            //setup misc listeners for the map
            _this._setupMapListeners();
            //setup listeners for voyent-location-route components
            _this._setupRouteListeners();
            //initialize location data on the map
            if (voyent.auth.isLoggedIn()) {
                _this.refreshMap();
            }
            //make sure the map is sized correctly when the window size changes
            google.maps.event.addListener(window, "resize", function () {
                _this.resizeMap();
            });
        };
        if (!('google' in window) || !('maps' in window.google)) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAZVsIO4CmSqqE7qbSO8pB0JPVUkO5bOd8&v=3.27&' +
                'libraries=places,geometry,visualization,drawing&callback=initializeLocationsMap';
            this.$.container.appendChild(script);
        }
        else {
            initializeLocationsMap();
        }
    },

    /**
     * Handles adding button for creating user locations.
     * @private
     */
    _addUserButton: function() {
        if (!this._userButtonAdded) {
            var _this = this;
            var userBttn = this.$.userBttn.cloneNode(true);
            userBttn.onclick = this._customBttnClicked;
            this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(userBttn);
            //delay so that the button isn't shown on
            //the page before being moved into the map
            setTimeout(function() {
                userBttn.hidden = false;
                _this._userButtonAdded = true;
            },100);
        }
    },

    /**
     * Handles adding button for creating tracker locations.
     * @private
     */
    _addTrackerButton: function() {
        if (!this._trackerButtonAdded) {
            var _this = this;
            if (this._trackers && Object.keys(this._trackers).length) {
                var trackerBttn = this.$.trackerBttn.cloneNode(true);
                trackerBttn.onclick = this._customBttnClicked.bind(this);
                this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(trackerBttn);
                //delay so that the button isn't shown on
                //the page before being moved into the map
                setTimeout(function () {
                    trackerBttn.hidden = false;
                    _this._trackerButtonAdded = true;
                }, 100);
            }
        }
    },

    /**
     * Retrieve the latest data from the Location Service and refresh the map.
     * @returns {*}
     */
    refreshMap: function() {
        var _this = this;
        if (typeof google === 'undefined' || !this.realm) {
            return;
        }
        this._bounds = new google.maps.LatLngBounds();
        //refresh list of simulations
        this.getSimulations();
        //refresh realm users
        this._getRealmUsers();
        //delete old location data
        this._clearLocationData();
        //clear tracker instances
        this._removeAllRoutes(true);
        //all tracker templates
        this._trackers = null;
        //chain async calls so we can have one unified callback
        var promises = [];
        //get regioins, poi, tracker template and last user and tracker locations
        //ignore regions that are tracker zones
        promises.push(voyent.locate.findRegions({realm:this.realm,query:{"location.properties.trackerId":{"$exists":false}}}).then(function(regions) {
            _this._updateRegions(regions);
        }));
        promises.push(voyent.locate.getAllPOIs({realm:this.realm}).then(function(pois) {
            _this._updatePOIs(pois);
        }));
        promises.push(voyent.locate.getAllTrackers({realm:this.realm}).then(function(trackers) {
            _this._mapTrackers(trackers);
        }));
        promises.push(this._executeAggregate(this._lastUserLocations));
        promises.push(this._executeAggregate(this._lastTrackerLocations));
        Promise.all(promises).then(function() {
            _this._map.fitBounds(_this._bounds);
            _this._map.panToBounds(_this._bounds);
        })['catch'](function(error) {
            _this.fire('message-error', 'Issue getting location data: ' + error);
            console.error('Issue getting location data:',error);
        });
    },

    /**
     * Play all simulations (paused routes will be continued).
     */
    playAll: function() {
        if (!voyent.auth.isLoggedIn()) {
            return;
        }
        var children = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
        });
        if (!children.length) {
            return;
        }
        for (var i=0; i<children.length; i++) {
            children[i].playSimulation();
        }
    },

    /**
     * Pause all simulation routes.
     */
    pauseAll: function() {
        if (!voyent.auth.isLoggedIn()) {
            return;
        }
        var children = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
        });
        for (var i=0; i<children.length; i++) {
            children[i].pauseSimulation();
        }
    },

    /**
     * Cancel all simulation routes.
     */
    cancelAll: function() {
        if (!voyent.auth.isLoggedIn()) {
            return;
        }
        var children = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
        });
        for (var i=0; i<children.length; i++) {
            children[i].cancelSimulation();
        }
    },

    /**
     * Add a new simulation route. If parameters are not provided then the default values will be used.
     * @param label
     * @param user
     * @param origin
     * @param destination
     * @param travelmode
     * @param speed
     * @param speedunit
     * @param frequency
     */
    addRoute: function(label,user,origin,destination,travelmode,speed,speedunit,frequency) {
        var _this = this;
        if (!voyent.auth.isLoggedIn()) {
            return;
        }
        //first append the new route as a direct child of the component so it inherits any custom styling
        var route = new Voyent.LocationRoute(this._map,this._users,label,user,origin,destination,travelmode,speed,speedunit,frequency);
        Polymer.dom(this).appendChild(route);
        setTimeout(function(route) {
            var contentHidden = !!_this._children.length;
            _this.set('_contextMenuDisabled',contentHidden);
            //add a new tab for the child
            _this.push('_children',{
                "elem":route,
                "tabClass":contentHidden ? "" : "active",
                "tabLabel": label || 'New Route',
                "contentHidden": contentHidden
            });
            //move new child into tab (do this async so the template has time to render the new child tab)
            setTimeout(function(i) {
                Polymer.dom(_this.root).querySelector('div[data-index="'+i+'"]').appendChild(_this._children[i].elem);
            },0,_this._children.length-1);
        },0,route);
    },

    /**
     * Add a new tracker velocity vector. If optional parameters are not provided then the default values will be used.
     * @param tracker - The tracker template ID to draw the tracker from (required)
     * @param zoneNamespace - The tracker instance name (required)
     * @param position lat/lng coordinates provided as an array [lat,lng] (required)
     * @param bearing
     * @param speed
     * @param speedunit
     * @param duration
     * @param frequency
     * @param noLocationUpdate - Set to true to disable submitting the tracker location to the service on creation
     */
    addVector: function(tracker,zoneNamespace,position,bearing,speed,speedunit,duration,frequency,noLocationUpdate) {
        var _this = this;
        if (!voyent.auth.isLoggedIn()) {
            return;
        }
        if (!tracker) {
            this.fire('message-error', 'Issue adding vector: tracker id is required');
            console.error('Issue adding vector: tracker id is required');
            return;
        }
        if (!this._trackers[tracker]) {
            this.fire('message-error', 'Issue adding vector: invalid tracker id');
            console.error('Issue adding vector: invalid tracker id');
            return;
        }
        if (!zoneNamespace) {
            this.fire('message-error', 'Issue adding vector: zoneNamespace is required');
            console.error('Issue adding vector: zoneNamespace is required');
        }
        if (!position || !Array.isArray(position) || position.length !== 2) {
            this.fire('message-error', 'Issue adding vector: position is required and must be in the form [lat,lng]');
            console.error('Issue adding vector: zoneNamespace is required and must be in the form [lat,lng]');
        }
        //draw the tracker on the map
        this._drawTracker(tracker,zoneNamespace,position,!!noLocationUpdate);
        //first append the new tracker vector as a direct child of the component so it inherits any custom styling
        var vector = new Voyent.LocationVector(this._map,this._trackerInstances,tracker,zoneNamespace,bearing,speed,speedunit,duration,frequency);
        Polymer.dom(this).appendChild(vector);
        setTimeout(function (vector) {
            var contentHidden = !!_this._children.length;
            _this.set('_contextMenuDisabled',!contentHidden);
            //add a new tab for the child
            _this.push('_children',{
                "elem":vector,
                "tabClass":contentHidden ? "" : "active",
                "tabLabel": _this._trackers[tracker].label || tracker,
                "contentHidden": contentHidden
            });
            //move new child into tab (do this async so the template has time to render the new child tab)
            setTimeout(function(i) {
                Polymer.dom(_this.root).querySelector('div[data-index="'+i+'"]').appendChild(_this._children[i].elem);
            },0,_this._children.length-1);
        },0,vector);
    },

    /**
     * Reset the simulation (remove all currently defined routes).
     */
    resetSimulation: function() {
        //check for simulations component and if found reset the selected index
        var simulations = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-SIMULATIONS';
        });
        if (simulations) {
            simulations[0]._selectedIndex = null;
        }
        this._removeAllRoutes();
        this._activeSim = null;
        //maintain scroll position
        var scroll = this._getParentsScroll();
        setTimeout(function() {
            scrollTo(scroll.left,scroll.top);
        },50);
    },

    /**
     * Save the current simulation to a document collection of your choice. If a simulation id is not provided then one is generated by the server,
     * if a collection name is not provided the value of the `collection` attribute will be used.
     * @param simulationId
     * @param collection
     */
    saveSimulation: function(simulationId,collection) {
        var _this = this;
        if (!collection) {
            collection = this.collection;
        }
        var docCall = 'createDocument';
        var routes = [];
        var children = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
        });
        for (var i=0; i<children.length; i++) {
            routes.push(children[i].getJSON());
        }
        var params = {realm:this.realm,collection:collection,document:{routes:routes}};
        if (simulationId && simulationId.trim().length > 0) {
            params.id = simulationId;
            if (this._activeSim && this._activeSim._id === simulationId) {
                docCall = 'updateDocument';
            }
        }
        voyent.docs[docCall](params).then(function(uri) {
            if (params.id) {
                params.document._id = params.id;
            }
            else if (uri) {
                params.document._id = uri.split("/").pop();
            }
            _this._activeSim = params.document; //set as active simulation
            _this.getSimulations(collection); //refresh simulation list
        }).catch(function(error) {
            _this.fire('message-error', 'Issue saving simulation document: ' + error);
            console.error('Issue saving simulation document:',error);
        });
    },

    /**
     * Delete a simulation from a document collection of your choice. If a collection name is not provided we will use the value of the `collection` attribute..
     * @param simulationId
     * @param collection
     */
    deleteSimulation: function(simulationId,collection) {
        var _this = this;
        if (!simulationId || simulationId.trim().length === 0) {
            return;
        }
        if (!collection) {
            collection = this.collection;
        }
        voyent.docs.deleteDocument({realm:this.realm,collection:collection,id:simulationId}).then(function() {
            if (_this._activeSim._id === simulationId) {
                //the active simulation was deleted so reset the simulation routes
                _this._activeSim = null;
                _this.resetSimulation();
            }
            _this.getSimulations(collection); //refresh simulation list
        }).catch(function(error) {
            _this.fire('message-error', 'Issue deleting simulation: ' + error);
            console.error('Issue deleting simulation:',error);
        });
    },

    /**
     * Get previously saved simulations from a collection of your choice. If a collection name is not provided we will use the value of the `collection` attribute.
     * @param collection
     */
    getSimulations: function(collection) {
        var _this = this;
        if (!collection) {
            collection = this.collection;
        }
        voyent.docs.findDocuments({realm:this.realm,collection:collection}).then(function(simulations) {
            _this.fire('simulationsRetrieved',{simulations:simulations});
        }).catch(function(error) {
            _this.fire('message-error', 'Issue getting simulations: ' + error);
            console.error('Issue getting simulations:',error);
        });
    },

    /**
     * Load a simulation from JSON format.
     * @param simulation
     */
    loadSimulation: function(simulation) {
        if (!simulation.routes) {
            return;
        }
        this._removeAllRoutes();
        this._generateTabs(simulation.routes);
        this._activeSim = simulation;
        //maintain scroll position
        var scroll = this._getParentsScroll();
        setTimeout(function() {
            scrollTo(scroll.left,scroll.top);
        },50);
    },

    /**
     * Trigger the Google Map resize event and recalculate the map size.
     */
    resizeMap: function() {
        if (('google' in window) && this._map) {
            this._calcMapSize();
            google.maps.event.trigger(this._map, "resize");
        }
    },


    //******************PRIVATE API******************

    /**
     * Creates aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _createAggregate: function(query) {
        var _this = this;
        var id = query._id;
        voyent.query.createQuery({realm:this.realm,id:id,query:query}).then(function() {
            _this._executeAggregate(query);
        });
    },

    /**
     * Executes aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _executeAggregate: function(query) {
        var _this = this;
        var id = query._id;
        voyent.query.executeQuery({realm:this.realm,id:id}).then(function(results) {
            if (id === '_getLastUserLocations') {
                _this._updateLocations(results);
            }
            else {
                _this._updateTrackerInstances(results);
            }
        }).catch(function(error) {
            var res = JSON.parse(error.response);
            if (res.status === 404 ||
                (res.status === 500 && res.code == 'contextNotFound')) {
                _this._createAggregate(query);
            }
        })
    },

    /**
     * Aggregate query for getting all last user locations.
     */
    _lastUserLocations: {"_id":"_getLastUserLocations","query":[{"$match":{"_data.location.properties.trackerId":{"$exists":false}}},{"$sort":{"_data.lastUpdated":-1}},{"$group":{"_id":"$_data.username","username":{"$first":"$_data.username"},"location":{"$first":"$_data.location"},"lastUpdated":{"$first":"$_data.lastUpdated"}}},{"$project":{"_id":0,"location":1,"username":1,"lastUpdated":1}}],"properties":{"title":"Find Last User Locations","service":"locate","collection":"locations","type":"aggregate"}},

    /**
     * Aggregate query for getting all last tracker locations.
     */
    _lastTrackerLocations: {"_id":"_getLastTrackerLocations","query":[{"$match":{"_data.location.properties.trackerId":{"$exists":true}}},{"$sort":{"_data.lastUpdated":-1}},{"$group":{"_id":"$_data.username","location":{"$first":"$_data.location"},"lastUpdated":{"$first":"$_data.lastUpdated"}}},{"$project":{"_id":0,"location":1,"username":1,"lastUpdated":1}}],"properties":{"title":"Find Last Tracker Locations","service":"locate","collection":"locations","type":"aggregate"}},

    /**
     * Draw regions and points of interest on the map.
     * @param data
     * @private
     */
    _updateRegionsAndPOIs: function(data) {
        var _this = this;
        for (var i=0; i<data.length; i++) {
            try {
                var location = data[i].location;
                if (!location) {
                    continue;
                }
                var geometry = location.geometry;
                if (!geometry) {
                    continue;
                }
                var type = geometry.type.toLowerCase();
                var coords = data[i].location.geometry.coordinates;
                var properties = typeof data[i].location.properties === "undefined" ? {} : data[i].location.properties;
                var googlePoint;
                if (type === "polygon") { //region
                    var region;
                    var paths = [];
                    var path = [];
                    var color = '#' + properties.Color;
                    var opacity = properties.Opacity ? properties.Opacity : 0.5;
                    var metadata = typeof properties.googleMaps === "undefined" ? {} : properties.googleMaps;
                    if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
                        metadata.shape = "polygon";
                        //generate the paths and extend the map bounds for polygon shapes
                        for (var j=0; j<coords.length; j++) {
                            for (var k=0; k<coords[j].length; k++) {
                                googlePoint = new google.maps.LatLng(coords[j][k][1], coords[j][k][0]);
                                path.push(googlePoint);
                                this._bounds.extend(googlePoint);
                            }
                            paths.push(path);
                        }
                        region = new google.maps.Polygon({
                            'paths': paths,
                            'map': this._map,
                            'editable': false,
                            'fillColor': color,
                            'fillOpacity': opacity
                        });
                    } else if (metadata.shape === "circle") {
                        region = new google.maps.Circle({
                            'center': new google.maps.LatLng(metadata.center[Object.keys(metadata.center)[0]], metadata.center[Object.keys(metadata.center)[1]]),
                            'radius': metadata.radius,
                            'map': this._map,
                            'editable': false,
                            'fillColor': color,
                            'fillOpacity': opacity
                        });
                    } else if (metadata.shape === "rectangle") {
                        region = new google.maps.Rectangle({
                            'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
                                coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
                                coords[0][2][0])),
                            'map': this._map,
                            'editable': false,
                            'fillColor': color,
                            'fillOpacity': opacity
                        });
                    }
                    if (metadata.shape !== 'polygon') {
                        this._bounds.union(region.getBounds());
                    }
                    this._clickListener(region,data[i].label || data[i]._id,null,metadata.shape);
                    this._regions.push(region);
                }
                else if (type === "point") { //poi
                    googlePoint = new google.maps.LatLng(coords[1], coords[0]);
                    var poi = new google.maps.Marker({
                        position: googlePoint,
                        map: this._map,
                        draggable: false
                    });
                    this._bounds.extend(googlePoint);
                    this._clickListener(poi,data[i].label || data[i]._id,null,type);
                    this._pointMarkers.push(poi);
                }
            } catch (error) {
                _this.fire('message-error', "Issue importing region or poi: " + error);
                console.error('Issue importing region or poi:',error);
            }
        }
    },

    /**
     * Draw user location markers on the map.
     * @param locations
     * @private
     */
    _updateLocations: function(locations) {
        var _this = this;
        locations.forEach(function(location) {
            var coords = location.location.geometry.coordinates;
            var latLng = new google.maps.LatLng(coords[1], coords[0]);
            _this._bounds.extend(latLng);

            var labelText = "?";
            if (location.username && location.username.length > 0) {
                labelText = location.username.substring(0, 1).toLowerCase();
            }
            var marker = new google.maps.Marker({
                position: latLng,
                map: _this._map,
                draggable: true,
                icon: _this.pathtoimages+'/images/user_marker.png',
                label: {
                    text: labelText,
                    color: "white",
                }
            });
            _this._userLocationChangedListener(marker,location);
            _this._clickListener(marker,null,location,location.location.geometry.type.toLowerCase());
            _this._handleNewLocationMarker(location.username,marker);
            //extend the bounds
            _this._map.fitBounds(_this._bounds);
            _this._map.panToBounds(_this._bounds);
        });
        //add the user location button
        _this._addUserButton();
    },

    /**
     * Clear user locations, regions, and points of interest from the map.
     * @private
     */
    _clearLocationData: function() {
        for (var key in this._locationMarkers) {
            if (this._locationMarkers.hasOwnProperty(key)) {
                this._locationMarkers[key].setMap(null);
            }
        }
        this._locationMarkers = {};
        this._regions.forEach(function(region) {
            region.setMap(null);
        });
        this._regions = [];
        this._pointMarkers.forEach(function(point) {
            point.setMap(null);
        });
        this._pointMarkers = [];
    },

    /**
     * Draw regions on the map, wrapper for `_updateRegionsAndPOIs()`.
     * @param regions
     * @private
     */
    _updateRegions: function(regions) {
        this._updateRegionsAndPOIs(regions);
    },

    /**
     * Draw points of interest on the map, wrapper for `_updateRegionsAndPOIs()`.
     * @param pois
     * @private
     */
    _updatePOIs: function(pois) {
        this._updateRegionsAndPOIs(pois);
    },

    /**
     * Store the fetched tracker templates, keyed by _id.
     * @param trackers
     * @private
     */
    _mapTrackers: function(trackers) {
        var _this = this;
        var trackerData, zones;

        //the following code is mostly incident demo specific, the
        //only piece that isn't is setting '_trackers' object
        voyent.scope.getRealmData({'property':'trackerData'}).then(function(data) {
            trackerData = data;
            processMessageTemplates();
        }).catch(function(error) {
            if (error.status !== 404) {
                _this.fire('message-error', 'Issue retrieving message templates');
                console.error('Issue retrieving message templates:',error);
            }
        });
        function processMessageTemplates() {
            var trackerMapping = {}, zone;
            for (var i=0; i<trackers.length; i++) {
                //keep a mapping of all the trackers so we can easily create instances of them later
                var trackerId = trackers[i]._id;
                trackerMapping[trackerId] = trackers[i];
                zones = trackers[i].zones.features;
                if (!trackers[i].properties) {
                    trackers[i].properties = {};
                }
                //if we have a "child" tracker template we set the trackerId to the parent's when searching for icons
                if (trackers[i].properties.parentTrackerId) {
                    trackerId = trackers[i].properties.parentTrackerId;
                }
                for (var j=0; j<zones.length; j++) {
                    zone = zones[j].properties.zoneId;
                    //set default icon to fallback to in case we don't find an icon
                    trackers[i].properties.icon = 'incident_marker.png';
                    //search the message templates for an icon and save the first one that is found
                    if (trackerData) {
                        if (trackerData[trackerId] && trackerData[trackerId][zone]) {
                            if (trackerData[trackerId][zone].global &&
                                trackerData[trackerId][zone].global.icon) {
                                trackers[i].properties.icon = _parseIconURL(trackerData[trackerId][zone].global.icon);
                                break;
                            }
                            else if (trackerData[trackerId][zone].increase &&
                                     trackerData[trackerId][zone].increase.icon) {
                                trackers[i].properties.icon = _parseIconURL(trackerData[trackerId][zone].increase.icon);
                                break;
                            }
                            else if (trackerData[trackerId][zone].decrease &&
                                     trackerData[trackerId][zone].decrease.icon) {
                                trackers[i].properties.icon = _parseIconURL(trackerData[trackerId][zone].decrease.icon);
                                break;
                            }
                        }
                    }
                }
            }
            _this._trackers = trackerMapping;
            //add the tracker location button
            _this._addTrackerButton();
        }
        function _parseIconURL(url) {
            var parts = url.split('/');
            var img = parts[parts.length-1];
            return img.replace('_inverted','');
        }
    },

    /**
     * Draw tracker instances and their associated zones on the map.
     * @param locations
     * @private
     */
    _updateTrackerInstances: function(locations) {
        var _this = this;
        //since the call for getting the tracker templates and instances occurs simultaneously we must make
        //sure we are done fetching the trackers before proceeding. We do the calls simultaneously instead
        //of chaining the calls so that we fetch all required data from the services as soon as possible
        function waitForTrackers() {
            if (!_this._trackers) {
                setTimeout(function(){waitForTrackers();},500);
                return;
            }
            //the trackers object was initialized which means we fetched
            //the tracker templates but none we're found so we'll bail
            if (!Object.keys(_this._trackers).length) {
                return;
            }
            for (var i=0; i<locations.length; i++) {
                //only proceed if the tracker instance has a matching template
                var tracker = _this._trackers[locations[i].location.properties.trackerId];
                if (!tracker) {
                    continue;
                }
                //load default bearing/speed/duration values from tracker properties
                var bearing = null, speed = null, speedunit = null, duration = null;
                if (tracker.properties) {
                    bearing = tracker.properties.bearing;
                    speed = tracker.properties.speed;
                    speedunit = tracker.properties.speedunit;
                    duration = tracker.properties.duration;
                }
                _this.addVector(locations[i].location.properties.trackerId,
                                locations[i].location.properties.zoneNamespace,
                                locations[i].location.geometry.coordinates.reverse(),
                                bearing,speed,speedunit,duration,null,true);
            }
        }
        waitForTrackers();
    },

    /**
     * Handles generating tabs when loading a simulation.
     * @param routes
     * @private
     */
    _generateTabs: function(routes) {
        //reset the bounds so we fit the map to the loaded sim
        this._bounds = new google.maps.LatLngBounds();
        if (routes && routes.length > 0) {
            for (var j=0; j<routes.length; j++) {
                if (routes[j].tracker) {
                    this.addVector(routes[j].tracker, routes[j].zonenamespace, routes[j].position, routes[j].bearing,
                                   routes[j].speed, routes[j].speedunit, routes[j].duration, routes[j].frequency);
                }
                else {
                    this.addRoute(routes[j].label, routes[j].user, routes[j].origin, routes[j].destination,
                                  routes[j].travelmode, routes[j].speed, routes[j].speedunit, routes[j].frequency);
                }
            }
        }
    },

    /**
     * Remove all routes (user and tracker) or just trackers.
     * @param trackersOnly
     * @private
     */
    _removeAllRoutes: function(trackersOnly) {
        for (var i=this._children.length-1; i >= 0; i--) {
            if (trackersOnly && this._children[i].elem.nodeName !== 'VOYENT-LOCATION-VECTOR') {
                continue;
            }
            //if the routes contain a tracker vector be sure to remove the associated entity from the map
            if (this._children[i].elem.nodeName === 'VOYENT-LOCATION-VECTOR') {
                this._removeTracker(this._children[i],!!trackersOnly);
            }
            Polymer.dom(this).removeChild(this._children[i].elem);
            this.splice('_children',i,1);
        }
    },

    /**
     * Set the origin on the active route via the context menu.
     * @private
     */
    _setAsOrigin: function() {
        this._hideContextMenu = true;
        var child;
        for (var i=0; i<this._children.length; i++) {
            if (!this._children[i].contentHidden) {
                child = this._children[i].elem;
                break;
            }
        }
        child._setOrigin(this._contextMenuPosition.lat()+","+this._contextMenuPosition.lng());
    },

    /**
     * Set the destination on the active route via the context menu.
     * @private
     */
    _setAsDestination: function() {
        this._hideContextMenu = true;
        var child;
        for (var i=0; i<this._children.length; i++) {
            if (!this._children[i].contentHidden) {
                child = this._children[i].elem;
                break;
            }
        }
        child._setDestination(this._contextMenuPosition.lat()+","+this._contextMenuPosition.lng());
    },

    /**
     * Try to get the realm users.
     */
    _getRealmUsers: function() {
        var _this = this;
        //pass the users to the child components and set the users internally so they can be passed in the constructor of new routes defined via the `routes` attribute
        voyent.admin.getRealmUsers({realmName:this.realm}).then(function(users) {
            var usernames = [];
            if (users && users.length > 0) {
                usernames = users.map(function(user) {
                    return user.username;
                });
                //add the current user to the list (they won't be included because the current user is an admin)
                usernames.unshift(voyent.auth.getLastKnownUsername());
            }
            //fire event and set users locally
            _this.fire('usersRetrieved',{users:usernames.length>0?usernames:null});
            _this._users = usernames.length>0?usernames:null;
        }).catch(function(error) {
            //always assume not an admin if something went wrong
            _this.fire('usersRetrieved',{users:null});
            _this._users = null;
            if (error.status == 403) {
                return; //fail "silently" if insufficient privileges
            }
            _this.fire('message-error', 'Error trying to get realm users: ' + error);
            console.error('Issue getting realm users:',error);
        });
    },

    /**
     * When a map overlay is clicked display an infoWindow with some relative information.
     * @param overlay
     * @param name
     * @param location
     * @param shape
     */
    _clickListener: function(overlay,name,location,shape) {
        var _this = this;
        if (!this._infoWindow) { //load "lazily" so google object is available
            this._infoWindow = new google.maps.InfoWindow();
        }
        //display infoWindow and hide context menu on map click
        google.maps.event.addListener(overlay, 'click', function () {
            var content = '<div style="overflow:auto;font-weight:bold;">';
            if (name) {
                content = content + name + "</div>";
            }
            if (shape === "polygon") {
                _this._infoWindow.setPosition(overlay.getPath().getAt(0));
            }
            else if (shape === "circle") {
                _this._infoWindow.setPosition(overlay.getCenter());
            }
            else if (shape === "rectangle") {
                _this._infoWindow.setPosition(overlay.getBounds().getNorthEast());
            }
            else { //shape === "point"
                _this._infoWindow.setPosition(overlay.getPosition());
                var username = location && location.username ? location.username+'<br/>' : '';
                var date = location && location.lastUpdated ? new Date(location.lastUpdated).toLocaleString() : '';
                content = content+username+date+'</div>';
            }
            _this._infoWindow.setContent(content);
            _this._infoWindow.open(_this._map,overlay);
            _this._hideContextMenu = true;
        });
    },

    /**
     * When a new user is dropped on the map then display a menu for selecting the user or drop the current user.
     * When an incident is dropped we'll draw it immediately since the type of incident was already selected.
     * @param drawingManager
     * @private
     */
    _setupNewLocationListener: function(drawingManager) {
        var _this = this;
        google.maps.event.addListener(drawingManager, 'markercomplete', function (marker) {
            //hide the marker since we'll draw it later
            marker.setVisible(false);
            //set the icon based on the selected button
            marker.setIcon(_this.pathtoimages+'/images/'+_this._selectedBttn+'_marker.png');
            if (_this._selectedBttn === 'user') {
                _this._renderUserMenu(marker)
            }
            else {
                //store the click coordinates for later use
                _this._lastClickCoordinates = [marker.getPosition().lat(),marker.getPosition().lng()];
                _this._drawIncident();
            }
            //back to regular (no drawing) mode
            _this._drawingManager.setDrawingMode(null);
        });
    },

    /**
     * Listener for tracker zone resizing that triggers child template creation or updating.
     * @param trackerId
     * @param zoneNamespace
     * @param zoneId
     * @param circle
     * @private
     */
    _zoneResizeListener: function(trackerId,zoneNamespace,zoneId,circle) {
        var _this = this;
        //clear the listeners first since we will call this function twice
        //in cases where we need to dynamically create a template
        google.maps.event.clearListeners(circle,'radius_changed');
        google.maps.event.addListener(circle, "radius_changed", function() {
            var trackerInstance = _this._trackerInstances[trackerId+'.'+zoneNamespace];
            //clone the parent tracker if we are creating a new template
            //because we'll use it as the base for our new one
            var tracker = _this._trackers[trackerId];
            var isNewTemplate = !tracker.properties || !tracker.properties.parentTrackerId;
            if (isNewTemplate) {
                tracker = JSON.parse(JSON.stringify(tracker));
                //set our new tracker base into our instance
                trackerInstance.tracker = tracker;
                //set the new template position to the tracker instance coordinate
                tracker.anchor.geometry.coordinates = [trackerInstance.marker.getPosition().lng(),trackerInstance.marker.getPosition().lat()]; //anchor coordinates are lng,lat
            }
            var matchingZone = null;
            var zones = tracker.zones.features;
            for (var i=0; i<zones.length; i++) {
                if (isNewTemplate) {
                    //set the new template zones to the tracker instance coordinate
                    zones[i].properties.googleMaps.center = [trackerInstance.marker.getPosition().lat(),trackerInstance.marker.getPosition().lng()]; //googleMaps coordinates are lat,lng
                }
                if (zones[i].properties.zoneId === zoneId) {
                    matchingZone = zones[i];
                }
            }
            if (matchingZone) {
                //disable tracker movements and resizing until we've saved the tracker template
                _this._toggleEditableTracker(trackerInstance.zones,trackerInstance.marker,false);
                //add parentTrackerId property if this isn't already a child
                if (!tracker.properties) {
                    tracker.properties = {};
                }
                if (isNewTemplate) {
                    tracker.properties.parentTrackerId = trackerId;
                    //set tracker id based on trackerId and instance name
                    tracker._id = trackerId+'.'+zoneNamespace
                }
                //set the new zone radius and coordinates
                matchingZone.properties.googleMaps.radius = circle.getRadius();
                _this._setCoordinates(trackerInstance);
                //save the template
                _this._saveTrackerTemplate(tracker.properties.parentTrackerId,zoneNamespace,tracker,isNewTemplate);
            }
        });
    },

    /**
     * Calculates and sets the coordinates of zones based on their center position and radius.
     * @param trackerInstance
     * @private
     */
    _setCoordinates: function (trackerInstance) {
        var N = 50; //number of "sides" the circle approximation will have
        var degreeStep = 360 / N;
        var geoZone;
        for (var i=0; i<trackerInstance.tracker.zones.features.length; i++) {
            geoZone = trackerInstance.tracker.zones.features[i];
            geoZone.geometry.coordinates = [[]];
            for (var j = 0; j < N; j++) {
                var latLng = google.maps.geometry.spherical.computeOffset(trackerInstance.zones[i].getCenter(), trackerInstance.zones[i].getRadius(), degreeStep * j);
                geoZone.geometry.coordinates[0].push([latLng.lng(), latLng.lat()]);
            }
            //push the same coordinate as the start coordinate to complete the circle
            geoZone.geometry.coordinates[0].push(geoZone.geometry.coordinates[0][0]);
        }
    },

    /**
     * Handles saving or updating child tracker templates.
     * @param parentTrackerId
     * @param zoneNamespace
     * @param tracker
     * @param isNewTemplate
     * @private
     */
    _saveTrackerTemplate: function(parentTrackerId,zoneNamespace,tracker,isNewTemplate) {
        var _this = this;

        var func = isNewTemplate ? 'createTracker' : 'updateTracker';
        //delete icon before posting since it's just used locally
        var icon = tracker.properties.icon; delete tracker.properties.icon;

        voyent.locate[func]({realm:this.realm, id:tracker._id, tracker:tracker}).then(function (uri) {
            //save the icon again
            tracker.properties.icon = icon;
            //store new tracker template in mapping
            _this._trackers[tracker._id] = tracker;
            var trackerInstance = _this._trackerInstances[tracker._id+'.'+zoneNamespace]; //will be undefined if it is a new template
            if (isNewTemplate) {
                //update the child component with the new tracker template ID, loop
                //backwards since it's likely one of the last children added
                for (var i=_this._children.length-1; i>=0; i--) {
                    if (_this._children[i].elem.tracker === tracker.properties.parentTrackerId &&
                        _this._children[i].elem.zonenamespace === zoneNamespace) {
                        _this._children[i].elem.tracker = tracker._id;
                        break;
                    }
                }
                //associate the tracker instance with the new template instead of the parent
                if (_this._trackerInstances[parentTrackerId+'.'+zoneNamespace]) {
                    _this._trackerInstances[tracker._id+'.'+zoneNamespace] = _this._trackerInstances[parentTrackerId+'.'+zoneNamespace];
                    delete _this._trackerInstances[parentTrackerId+'.'+zoneNamespace];
                    trackerInstance = _this._trackerInstances[tracker._id+'.'+zoneNamespace];
                    //remove tracker instances from the service that were created under the parent template
                    voyent.locate.deleteTrackerInstance({realm:_this.realm,id:parentTrackerId,zoneNamespace:zoneNamespace}).then(function() {
                    }).catch(function(error) {
                        _this.fire('message-error', 'Issue deleting tracker instance: ' + zoneNamespace + ' ' + error);
                        console.error('Issue deleting tracker instance:',zoneNamespace,error);
                    });
                }
                //create a tracker instance for the new template
                var location = {
                    "location": {
                        "geometry": { "type" : "Point", "coordinates" : [tracker.anchor.geometry.coordinates[0],tracker.anchor.geometry.coordinates[1]] },
                        "properties": {
                            "trackerId": tracker._id,
                            "zoneNamespace": zoneNamespace,
                            "updateType": "manual" //incident demo
                        }
                    }
                };
                //send a location update for this instance
                _this._updateTrackerLocation(location,function() {
                    //re-initialize tracker location changed listener so it's associated with the new tracker instance
                    _this._trackerLocationChangedListener(trackerInstance.marker,tracker._id+'.'+zoneNamespace,location);
                    //re-initialize zone resize listener so it's associated with the new tracker template
                    for (var i=0; i<trackerInstance.tracker.zones.features.length; i++) {
                        _this._zoneResizeListener(tracker._id,zoneNamespace,trackerInstance.tracker.zones.features[i].properties.zoneId,trackerInstance.zones[i]);
                    }
                    //re-enable tracker movements and resizing since we've
                    //saved the tracker template and created an instance
                    _this._toggleEditableTracker(trackerInstance.zones,trackerInstance.marker,true);
                });
            }
            else {
                //re-enable tracker movements and resizing since we've updated the tracker template
                _this._toggleEditableTracker(trackerInstance.zones,trackerInstance.marker,true);
            }
        }).catch(function (error) {
            _this.fire('message-error', 'Issue updating tracker template: ' + error);
            console.error('Issue updating tracker template:',error);
        });
    },

    /**
     * Displays a list menu where you can select a user to create a new location for.
     * @param marker
     * @private
     */
    _renderUserMenu: function(marker) {
        //store the click coordinates for later use
        this._lastClickCoordinates = [marker.getPosition().lat(),marker.getPosition().lng()];
        if (!this._users || !this._users.length) {
            this._selectUser(null);
        }
        else {
            //set the menu width based on the longest string in the menu
            var strLength = Math.max.apply(Math, this._users.map(function(username) {
                return username.length;
            }));
            this.$.userMenu.style.width = (7.5*strLength)+'px';
            //set the menu height based on the number of menu items
            this.$.userMenu.style.height = 24*this._users.length+'px';
            //render the context menu at the pixel coordinate
            var pos = this._returnPixelCoordinate(marker.getPosition());
            this.$.userMenu.style.left = pos.left + 'px';
            this.$.userMenu.style.top = pos.top + 'px';
            this._hideUserMenu = false;
        }
        //we no longer need the marker so delete it
        marker.setMap(null);
    },

    /**
     * Displays a prompt for naming a tracker instance.
     * @param trackerId
     * @returns {string}
     * @private
     */
    _showIncidentNamePrompt: function (trackerId) {
        var trackerName = '';
        //check that the instance name is valid and not already being used
        var invalid = false;
        var msg = 'Enter an incident name';
        while (!trackerName || !trackerName.trim().length || invalid) {
            trackerName = prompt(msg, '');
            if (trackerName === null) { //cancel was pressed
                return null;
            }
            invalid = !!(this._trackerInstances[trackerId+'.'+trackerName] || //check for zoneNamespace being used for parent trackers
                         this._trackerInstances[trackerId+'.'+trackerName+'.'+trackerName]); //check for zoneNamespace being used for child trackers
            if (invalid) {
                msg = 'Incident name already in use, try another';
            }
        }
        return trackerName;
    },

    /**
     * Fired when a tracker template is selected after creating a tracker instance.
     * @param e
     * @private
     */
    _selectUser: function(e) {
        var _this = this;
        this._hideUserMenu = true;
        var username = e && e.target ? e.target.getAttribute('data-user') : voyent.auth.getLastKnownUsername();
        var coordinates = this._lastClickCoordinates;
        //create marker based on position
        var marker = new google.maps.Marker({
            position: new google.maps.LatLng(coordinates[0],coordinates[1]),
            map: this._map,
            draggable: true,
            icon: this.pathtoimages+'/images/user_marker.png'
        });
        this._handleNewLocationMarker(username,marker);
        var location = {
            "location": {
                "geometry": { "type" : "Point", "coordinates" : [coordinates[1],coordinates[0]] }
            },
            "username": username,
            "demoUsername": username
        };
        voyent.locate.updateLocation({realm:_this.realm,location:location}).then(function(data) {
            location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            _this._userLocationChangedListener(marker,location);
            _this._clickListener(marker,null,location,location.location.geometry.type.toLowerCase());
        }).catch(function(error) {
            _this.fire('message-error', 'Issue creating new location: ' + error);
            console.error('Issue creating new location:',error);
        });
        this._lastClickCoordinates = null;
    },

    /**
     * Fired when a tracker template is selected.
     * @param e
     * @private
     */
    _selectIncident: function(e) {
        //enable the marker mode
        document.querySelector('voyent-location-simulator')._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
        //hide the menu since we're done with it
        this._hideIncidentMenu = true;
        //store the id of the selected tracker for later use
        this._selectedIncidentId = e.target.getAttribute('data-id');
    },

    /**
     * Fired when the user clicks on the map to set the position of a tracker.
     * @private
     */
    _drawIncident: function() {
        var trackerId = this._selectedIncidentId;
        //generate a zoneNamespace so we don't need to ask the user to input it
        var zoneNamespace = trackerId + '_' + new Date().getTime();
        //load default bearing/speed/duration values from tracker properties
        var properties = this._trackers[trackerId].properties;
        var bearing = null, speed = null, speedunit = null, duration = null;
        if (properties) {
            bearing = properties.bearing;
            speed = properties.speed;
            speedunit = properties.speedunit;
            duration = properties.duration;
        }
        this._mapBoundsFixed = true; //don't adjust map bounds when creating tracker instance
        this.addVector(trackerId,zoneNamespace,this._lastClickCoordinates,bearing,speed,speedunit,duration);
        this._lastClickCoordinates = null;
    },

    _drawTracker: function(trackerId,zoneNamespace,position,noLocationUpdate) {
        var _this = this;

        //we will use our tracker template object to store the latest coordinates of a tracker instance
        //since we can have multiple instances of a single template we want to clone the object first
        var tracker = JSON.parse(JSON.stringify(this._trackers[trackerId]));

        //create marker based on position
        var marker = new google.maps.Marker({
            position: new google.maps.LatLng(position[0],position[1]),
            map: this._map,
            draggable: true,
            icon: this.pathtoimages+'/images/'+tracker.properties.icon
        });
        this._handleNewLocationMarker(trackerId+'.'+zoneNamespace,marker);

        //now that we have a location save it in the tracker
        tracker.anchor.geometry.coordinates = [marker.getPosition().lng(),marker.getPosition().lat()];

        var location = {
            "location": {
                "geometry": { "type" : "Point", "coordinates" : [marker.getPosition().lng(),marker.getPosition().lat()] },
                "properties": {
                    "trackerId": trackerId,
                    "zoneNamespace": zoneNamespace,
                    "updateType": "manual" //incident demo
                }
            }
        };

        //associate the circle regions with the tracker
        this._trackerInstances[trackerId+'.'+zoneNamespace] = {"tracker":tracker,"zones":[],"marker":marker};
        //create the circle zones
        var circle;
        var zones = tracker.zones.features;
        for (var i=0; i<zones.length; i++) {
            circle = new google.maps.Circle({
                map: this._map,
                radius: zones[i].properties.googleMaps.radius,
                fillColor: '#'+ zones[i].properties.Color,
                fillOpacity:zones[i].properties.Opacity,
                zIndex: zones[i].properties.googleMaps.zIndex,
                editable: true,
                draggable: false
            });
            //bind the circle center to the marker position so that when we move the marker the circles get updated
            circle.bindTo('center', marker, 'position');
            //associate the zone with the tracker so we can sync them on movement
            this._trackerInstances[trackerId+'.'+zoneNamespace].zones.push(circle);
            //add listeners
            this._clickListener(zones[i],zones[i].properties.zoneId,null,"circle");
            this._zoneResizeListener(trackerId,zoneNamespace,zones[i].properties.zoneId,circle);
            //add to regions master list
            this._regions.push(circle);
            //set the bounds around this newly dropped tracker
            this._bounds.union(circle.getBounds());
        }
        //pan the map when the tracker is not created via the menu
        if (!this._mapBoundsFixed) {
            this._map.fitBounds(this._bounds);
            this._map.panToBounds(this._bounds);
        }
        this._mapBoundsFixed = false;

        if (!noLocationUpdate) {
            this._updateTrackerLocation(location,function() {
                _this._trackerLocationChangedListener(marker,trackerId+'.'+zoneNamespace,location);
                _this._clickListener(marker,zoneNamespace,null,"point");
            });
        }
        else {
            this._trackerLocationChangedListener(marker,trackerId+'.'+zoneNamespace,location);
            this._clickListener(marker,zoneNamespace,null,"point");
        }
    },

    /**
     * Convenience function for updating a tracker location.
     * @param location
     * @param cb
     * @private
     */
    _updateTrackerLocation: function(location,cb) {
        var _this = this;
        voyent.locate.updateTrackerLocation({location: location}).then(function(data) {
            location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            cb();
        }).catch(function (error) {
            _this.fire('message-error', 'Issue creating new tracker location: ' + location.location.properties.zoneNamespace);
            console.error('Issue creating new tracker location: ' + location.location.properties.zoneNamespace, error);
        });
    },

    /**
     * Setup various map listeners.
     * @private
     */
    _setupMapListeners: function() {
        var _this = this;
        //display context menu on right-click
        google.maps.event.addListener(this._map,"rightclick",function(event) {
            _this._handleRightClick(event);
        });
        //hide menus on map click
        google.maps.event.addListener(this._map, "click", function(event) {
            _this._hideContextMenu = _this._hideIncidentMenu = _this._hideUserMenu = true;
        });
        //odd fix for an issue where sometimes the map markers
        //would not be visible after fitting/panning the map
        google.maps.event.addListener(this._map, "idle", function(event) {
            _this._map.panTo(_this._map.getCenter());
        });
    },

    /**
     * Setup event listeners for `voyent-location-route` components.
     * @private
     */
    _setupRouteListeners: function() {
        var _this = this;
        //add event listeners for voyent-location-route events to parent since the events bubble up (one listener covers all children)
        this.addEventListener('startSimulation', function(e) {
            //set the max zoom so the map doesn't zoom in too far when panning during the simulation
            _this._map.setOptions({ maxZoom: 15 });
            //update our simulation count
            _this.fire('simulationCountUpdated',{"count":_this._simulationCount+1});
            var marker = e.detail.locationMarker;
            var location = e.detail.location;
            //add click listener to new location marker + make sure we only have one instance of the location marker
            if (e.detail.type === 'route') {
                _this._clickListener(marker,null,location,'point');
                _this._handleNewLocationMarker(location.username,marker);
            }
        });
        this.addEventListener('endSimulation',function(e) {
            _this.fire('simulationCountUpdated',{"count":_this._simulationCount-1});
        });
        this.addEventListener('labelChanged', function(e) {
            for (var i=0; i<_this._children.length; i++) {
                if (_this._children[i].elem === e.detail.child) {
                    //update tab label
                    this.set('_children.'+i+'.tabLabel',e.detail.label);
                }
            }
        });
    },

    /**
     * Fires when one of our custom buttons in the top right corner are clicked.
     * @param e
     * @private
     */
    _customBttnClicked:function(e) {
        //store the type of button for later user
        document.querySelector('voyent-location-simulator')._selectedBttn = e.target.getAttribute('data-type');
        //if we selected a tracker then display a popup menu
        if (e.target.getAttribute('data-type') === 'tracker') {
            this._displayTemplateMenu();
        }
        else { //otherwise just enable drawing mode since the user menu will be displayed after
            document.querySelector('voyent-location-simulator')._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
        }
    },

    /**
     * Toggles and populates the tracker template selection menu with the latest trackers.
     * @private
     */
    _displayTemplateMenu: function() {
        this._hideIncidentMenu = !this._hideIncidentMenu;
        if (!this._hideIncidentMenu) {
            //populate the menu with the latest tracker templates
            this._trackerMenuItems = [];
            for (var trackerKey in this._trackers) {
                if (!this._trackers.hasOwnProperty(trackerKey)) {
                    continue;
                }
                //only show "parent" tracker templates
                if (!this._trackers[trackerKey].properties || !this._trackers[trackerKey].properties.parentTrackerId) {
                    this.push('_trackerMenuItems', this._trackers[trackerKey]);
                }
            }
        }
    },

    /**
     * Display context-menu on rightclick.
     * @param event
     * @private
     */
    _handleRightClick: function(event) {
        if (this._contextMenuDisabled) {
            return;
        }
        //render the context menu at the pixel coordinate
        var pos = this._returnPixelCoordinate(event.latLng);
        this.$.contextMenu.style.left = pos.left + 'px';
        this.$.contextMenu.style.top = pos.top + 'px';
        this._hideContextMenu = false;
        //store the lat/lng for later use
        this._contextMenuPosition = event.latLng;
    },

    /**
     * Converts a lat/long coordinate to a pixel (left/top) coordinate.
     * @param latLng
     * @returns {{left: Number, top: Number}}
     * @private
     */
    _returnPixelCoordinate: function(latLng) {
        var scale = Math.pow(2, this._map.getZoom());
        var nw = new google.maps.LatLng(this._map.getBounds().getNorthEast().lat(),this._map.getBounds().getSouthWest().lng());
        var worldCoordinateNW = this._map.getProjection().fromLatLngToPoint(nw);
        var worldCoordinate = this._map.getProjection().fromLatLngToPoint(latLng);
        var pixelOffset = new google.maps.Point(
            Math.floor((worldCoordinate.x - worldCoordinateNW.x) * scale),
            Math.floor((worldCoordinate.y - worldCoordinateNW.y) * scale)
        );
        var scroll = this._getParentsScroll();
        var left = pixelOffset.x + this._map.getDiv().getBoundingClientRect().left + scroll.left + this.menuoffsetleft;
        var top = pixelOffset.y + this._map.getDiv().getBoundingClientRect().top + scroll.top + this.menuoffsettop;
        return {"left":left,"top":top};
    },

    /**
     * Returns the sum of scrollLeft and scrollTop for the component's parents.
     * @returns {{left: number, top: number}}
     * @private
     */
    _getParentsScroll: function() {
        var parent = this.parentNode;
        var scrollLeft=0, scrollTop=0;
        while (parent) {
            if (typeof parent.scrollLeft !== 'undefined' && !Number.isNaN(parent.scrollLeft)) {
                scrollLeft += parent.scrollLeft;
            }
            if (typeof parent.scrollTop !== 'undefined' && !Number.isNaN(parent.scrollTop)) {
                scrollTop += parent.scrollTop;
            }
            parent = parent.parentNode;
        }
        return {left:scrollLeft,top:scrollTop};
    },

    /**
     * Handles tab changes between routes.
     * @param e
     * @private
     */
    _tabChangeListener: function(e) {
        for (var i=0; i<this._children.length; i++) {
            if (this._children[i].elem === e.model.item.elem) {
                //show tab content
                this.set('_children.'+i+'.contentHidden',false);
                this.set('_children.'+i+'.tabClass','active');
                this.set('_contextMenuDisabled',this._children[i].elem.nodeName === 'VOYENT-LOCATION-VECTOR');
                continue;
            }
            //hide tab content
            this.set('_children.'+i+'.tabClass','');
            this.set('_children.'+i+'.contentHidden',true);
        }
    },

    /**
     * Handles tab closures (deleting routes).
     * @param e
     * @private
     */
    _tabCloseListener: function(e) {
        var matchingChild;
        for (var i=0; i<this._children.length; i++) {
            if (this._children[i] === e.model.item) {
                matchingChild = this._children[i];
                //if the closing tab was active then select the previous or next tab, if available
                if (matchingChild.tabClass === 'active') {
                    var index = null;
                    if (this._children[i-1]) {
                        index = i-1;
                    }
                    else if (this._children[i+1]) {
                        index = i+1;
                    }
                    if (index !== null) {
                        this.set('_children.'+index+'.tabClass','active');
                        this.set('_children.'+index+'.contentHidden',false);
                        this.set('_contextMenuDisabled',this._children[index].elem.nodeName === 'VOYENT-LOCATION-VECTOR');
                    }
                    else {
                        this.set('_contextMenuDisabled',true);
                    }
                }
                //if a tracker vector is deleted then remove it from the map as well
                if (matchingChild.elem.nodeName === 'VOYENT-LOCATION-VECTOR') {
                   this._removeTracker(matchingChild);
                }
                //delete route and remove tab
                Polymer.dom(this).removeChild(matchingChild.elem);
                this.splice('_children',i,1);
                break;
            }
        }
    },

    /**
     * Removes a tracker instance and it's associated zones from the map and service.
     * @param child
     * @param localDeleteOnly
     * @private
     */
    _removeTracker: function(child,localDeleteOnly) {
        var _this = this;
        var trackerId = child.elem.tracker;
        var zoneNamespace = child.elem.zonenamespace;
        var instance = this._trackerInstances[trackerId+'.'+zoneNamespace];
        if (!localDeleteOnly) {
            //remove tracker instance from the service, if the instance was based
            //on the child template the service will also delete that template
            voyent.locate.deleteTrackerInstance({realm:this.realm,id:trackerId,zoneNamespace:zoneNamespace}).then(function() {
            }).catch(function(error) {
                _this.fire('message-error', 'Issue deleting tracker instance: ' + zoneNamespace + ' ' + error);
                console.error('Issue deleting tracker instance:',zoneNamespace,error);
            });
        }
        //remove it from the map
        for (var j=0; j<instance.zones.length; j++) {
            //remove the regions from the map
            instance.zones[j].setMap(null);
            this._regions.splice(this._regions.indexOf(instance.zones[j]),1);
        }
        //remove the marker from the map
        instance.marker.setMap(null);
        //remove marker from list
        delete this._locationMarkers[trackerId+'.'+zoneNamespace];
        //delete the tracker instance reference
        delete this._trackerInstances[trackerId+'.'+zoneNamespace];
    },

    /**
     * Only keep the last location for a location (either tracker or user).
     * @param key - username of user locations, trackerId.zoneNamespace for tracker anchors
     * @param marker
     * @private
     */
    _handleNewLocationMarker: function(key,marker) {
        if (this._locationMarkers.hasOwnProperty(key)) {
            this._locationMarkers[key].setMap(null);
            delete this._locationMarkers[key];
        }
        this._locationMarkers[key] = marker;
    },

    /**
     * Determine the map size to use
     * This will leverage this.height and this.width if applicable
     * Otherwise the parent container size will be used
     * Note that if this.autoheight is specified that will override this.height
     */
    _calcMapSize: function() {
        var height = this.height;
        // If we have a valid autoheight specified we override with that
        if (this.autoheight && this.autoheight !== null && this.autoheight > 0) {
            var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
            
            if (h) {
                height = Math.round(h * this.autoheight);
            }
        }
        else {
            // If we don't have a height try the parent
            if (height == null) {
                height = this.$$("#container").clientHeight;
            }
            // If we still don't have a valid height default to a minimum
            if (height < 50) {
                height = 300;
            }
        }
        // Apply the height variable, which will be used for the map
        this.customStyle['--height-var'] = height + 'px';
        this.updateStyles();
        
        // For width we default to 100% unless this.width is specified
        if (this.width && this.width !== null && this.width > 0) {
            this.$$("#map").style.width = this.width + "px";
        }
        else {
            this.$$("#map").style.width = "100%";
        }
    },

    /**
     *
     * @param newVal
     * @param oldVal
     * @private
     */
    _pathtoimagesChanged: function(newVal, oldVal) {
        if (newVal.charAt[newVal.length-1] === '/') {
            this.path = newVal.slice(0,-1);
            return;
        }
        this.fire('pathtoimagesChanged',{'path':newVal});
    },

    //We use these wrappers because the on-click in the template passes an event parameter that we
    //don't want on the public functions, and in some cases we want to do some additional work

    /**
     * Wrapper for `addRoute(..)`.
     * @private
     */
    _addRoute: function() {
        this.addRoute();
    },

    /**
     * Wrapper for `resetSimulation()`.
     * @private
     */
    _resetSimulation: function() {
        var confirm = window.confirm("Are you sure?");
        if (!confirm) {
            return;
        }
        this.resetSimulation();
    },

    /**
     * Wrapper for `saveSimulation(..)`.
     * @private
     */
    _saveSimulation: function() {
        var simulation = window.prompt("Enter the simulation name", "Auto-Named");
        if (simulation === null) {
            return;
        }
        this.saveSimulation(simulation === "Auto-Named" || simulation.trim().length === 0 ? null : simulation);
    },

    /**
     * Wrapper for `saveSimulation(..)` that updates the active simulation.
     * @private
     */
    _updateSimulation: function() {
        this.saveSimulation(this._activeSim._id);
    },

    /**
     * Wrapper for `deleteSimulation(..)`.
     * @private
     */
    _deleteSimulation: function() {
        if (!this._activeSim) {
            return;
        }
        this.deleteSimulation(this._activeSim._id);
    },

    /**
     * Determine whether or not we display the buttons for managing multiple simulations.
     * @param numTabs
     * @returns {boolean}
     * @private
     */
    _displayAllBttns: function(numTabs) {
        return numTabs > 1;
    }
});
