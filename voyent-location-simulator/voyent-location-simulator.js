Polymer({
    is: "voyent-location-simulator",
    behaviors: [Voyent.LocationBehavior],

    properties: {
        /**
         * The Voyent account of the realm.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The Voyent realm to simulate motion in.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * Define routes as a JSON object array. This attribute can be used on its own or in conjunction with `voyent-location-route` and `voyent-location-vector` components.
         * Changing this attribute dynamically will replace any routes previously created with this attribute, but any routes created using the component will remain unchanged.
         *
         * Example:
         *
         *      //define two different types of routes
         *     [
         *         {
         *              "label":"ICEsoft Technologies To Calgary Tower",
         *              "origin": "1717 10 St NW, Calgary",
         *              "destination": "101 9 Ave SW, Calgary",
         *              "travelmode": "DRIVING",
         *              "speed": 60,
         *              "frequency": 5
         *          },
         *          {
         *              "label":"Storm moving NW",
         *              "tracker": "Tracker1",
         *              "bearing": "315",
         *              "speed": 45,
         *              "duration":5
         *              "frequency": 10
         *          }
         *      ]
         */
        routes: { type: Array, observer: '_routesChanged' },
        /**
         * The document collection to be used for CRUD operations on simulations.
         */
        collection: { type: String, value: 'simulator-routes' },
        /**
         * The relative path to the `images` resource directory. This may be
         * necessary when using the component as part of a custom build.
         */
        pathtoimages: { type: String, value: '.', observer: '_pathtoimagesChanged' }
    },

    //observe non-declared/private properties
    observers: [
        '_mapOrUsersChanged(_map, _users)'
    ],

    /**
     * Fired after the Google Map has been initialized. Contains the map object.
     * @event mapInitialized
     */
    /**
     * Fired when the realm users are retrieved. Contains the list of users.
     * @event usersRetrieved
     */
    /**
     * Fired when the trackers are retrieved or updated. Contains an object mapping of trackers and their associated zones.
     * @event trackersRetrieved
     */
    /**
     * Fired when the simulations are retrieved. Contains the list of saved simulations in the specified collection.
     *
     * @event simulationsRetrieved
     */

    ready: function() {
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }
        var _this = this;
        //set some default values
        this._locationMarkers = [];
        this._regions = [];
        this._pointMarkers = [];
        this._trackers = {};
        this._activeSim = null;
        this._hideContextMenu = this._contextMenuDisabled = this._hideIncidentMenu = this._hideVectorBttn = this._hideUserBttn = this._hideIncidentBttn = true;
        //initialize google maps
        window.initializeLocationsMap = function() {
            _this._map = new google.maps.Map(_this.$.map, {
                zoom: 8,
                center: new google.maps.LatLng(51.067799, -114.085237),
                mapTypeControlOptions: {
                    style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                    position: google.maps.ControlPosition.RIGHT_TOP
                },
                signed_in: false
            });
            _this.fire('mapInitialized',{map:_this._map});
            _this.calcHeight();
            _this._bounds = new google.maps.LatLngBounds();
            //setup ui and listener for manually adding new location markers
            var drawingManager = new google.maps.drawing.DrawingManager({
                drawingControlOptions: {
                    position:google.maps.ControlPosition.TOP_RIGHT,
                    drawingModes: []
                },
                markerOptions: { draggable: true }
            });
            drawingManager.setMap(_this._map);
            _this._drawingManager = drawingManager;
            _this._setupNewLocationListener(drawingManager);
            //setup listeners for the map (context menu listeners)
            _this._setupMapListeners();
            //setup listeners for voyent-location-route components
            _this._setupRouteListeners();
            //initialize location data on the map
            if (voyent.io.auth.isLoggedIn()) {
                _this.refreshMap();
            }
            //make sure the map is sized correctly when the window size changes
            google.maps.event.addDomListener(window, "resize", function() {
                _this.resizeMap();
            });
            _this._addCustomButtons();
        };
        if( !('google' in window) || !('maps' in window.google)){
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyAZVsIO4CmSqqE7qbSO8pB0JPVUkO5bOd8&v=3.25&' +
                'libraries=places,geometry,visualization,drawing&callback=initializeLocationsMap';
            this.$.container.appendChild(script);
        }
        else{
            initializeLocationsMap();
        }

        Polymer.dom(this).parentNode.addEventListener('trackersRetrieved', function(e) {
            _this._hideVectorBttn = false;
        });
    },
    
    calcHeight: function() {
        // Get our overall page height size
        var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
        
        // Account for the header
        if (document.getElementById("mainHeader")) {
            var headerHeight = document.getElementById("mainHeader").clientHeight;
            if (headerHeight) {
                h -= headerHeight;
            }
        }
        
        // Reduce the final size by a little bit
        h = Math.round(h/1.25);
        
        // Apply the height variable, which will be used for the map
        this.customStyle['--height-var'] = h + 'px';
        this.updateStyles();
    },

    _addCustomButtons: function() {
        //ideally we would just push this.$.*Bttn instead of cloning but google maps
        //removes the controls when modifying the local DOM (adding tabs). So we clone
        //the nodes instead and bind the onclick as if we are using plain HTML
        var incidentBttn = this.$.incidentBttn.cloneNode(true);
        var userBttn = this.$.userBttn.cloneNode(true);
        incidentBttn.onclick = this._customBttnClicked;
        userBttn.onclick = this._customBttnClicked;

        this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(userBttn);
        this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(incidentBttn);

        //delay so that the button isn't shown on
        //the page before being moved into the map
        setTimeout(function() {
            incidentBttn.hidden = false;
            userBttn.hidden = false;
        },100);
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
        //refresh realm users
        this._getRealmUsers();
        //delete old location data
        this._clearLocationData();
        //get current user location data
        var promises = [];
        promises.push(voyent.io.locate.findLocations({realm:this.realm,query:{"location.type":{"$ne": "Feature"}},fields:{"_id":0},options:{sort:{"lastUpdated":-1}}}).then(function(locations) {
            if (locations && locations.length) {
                //process the locations so we only keep the most recent update for each user
                var userLocations={};
                for (var i=0; i<locations.length; i++) {
                    if (locations[i].location.properties && locations[i].location.properties.trackerId) {
                        //ignore locations that are for trackers
                        continue;
                    }
                    if (userLocations.hasOwnProperty(locations[i].username)) {
                        if (locations[i].username.lastUpdated > userLocations[locations[i].username].lastUpdated) {
                            userLocations[locations[i].username]=locations[i];
                        }
                    }
                    else { userLocations[locations[i].username]=locations[i]; }
                }
                locations = Object.keys(userLocations).map(function(key){return userLocations[key]});
                _this._updateLocations(locations);
            }

        }));
        promises.push(voyent.io.locate.getAllRegions({realm:this.realm}).then(function(regions) {
            _this._updateRegions(regions);
        }));
        promises.push(voyent.io.locate.getAllPOIs({realm:this.realm}).then(function(pois) {
            _this._updatePOIs(pois);
        }));
        promises.push(voyent.io.locate.getAllTrackers({realm:this.realm}).then(function(trackers) {
            //update the map with the trackers
            _this._updateTrackers(trackers);
        }));
        return Promise.all(promises).then(function() {
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
        if (!voyent.io.auth.isLoggedIn()) {
            return;
        }
        var children = Polymer.dom(this).childNodes.filter(function(node) {
            return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
        });
        if (!children.length) {
            return;
        }
        if (children.length !== 1) {
            for (var i=0; i<children.length; i++) {
                children[i]._playSimulationMulti();
            }
        }
        else {
            children[0].playSimulation();
        }
    },

    /**
     * Pause all simulation routes.
     */
    pauseAll: function() {
        if (!voyent.io.auth.isLoggedIn()) {
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
        if (!voyent.io.auth.isLoggedIn()) {
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
        if (!voyent.io.auth.isLoggedIn()) {
            return;
        }
        //first append the new route as a direct child of the component so it inherits any custom styling
        Polymer.dom(this).appendChild(new Voyent.LocationRoute(this._map,this._users,label,user,origin,destination,travelmode,speed,speedunit,frequency));
        //add a new tab for the child
        var contentHidden = this._children.length ? true : false;
        this.push('_children',{
            "elem":Polymer.dom(this).lastElementChild,
            "tabClass":"",
            "tabLabel": label || 'New Route',
            "contentHidden": true
        });
        //move new child into tab (do this async so the template has time to render the new child tab)
        setTimeout(function() {
            Polymer.dom(_this.root).querySelector('div[data-index="'+parseInt(_this._children.length-1)+'"]').appendChild(_this._children[_this._children.length-1].elem);
        },0);
    },

    /**
     * Add a new tracker velocity vector. If parameters are not provided then the default values will be used.
     * @param label
     * @param tracker
     * @param bearing
     * @param speed
     * @param speedunit
     * @param duration
     * @param frequency
     */
    addVector: function(label,tracker,bearing,speed,speedunit,duration,frequency) {
        var _this = this;
        if (!voyent.io.auth.isLoggedIn()) {
            return;
        }
        //first append the new route as a direct child of the component so it inherits any custom styling
        Polymer.dom(this).appendChild(new Voyent.LocationVector(this._map,this._trackers,label,tracker,bearing,speed,speedunit,duration,frequency));
        //add a new tab for the child
        var contentHidden = this._children.length ? true : false;
        this.push('_children',{
            "elem":Polymer.dom(this).lastElementChild,
            "tabClass":"",
            "tabLabel": label || 'New Vector',
            "contentHidden": contentHidden
        });
        //move new child into tab (do this async so the template has time to render the new child tab)
        setTimeout(function() {
            Polymer.dom(_this.root).querySelector('div[data-index="'+parseInt(_this._children.length-1)+'"]').appendChild(_this._children[_this._children.length-1].elem);
        },0);
    },

    /**
     * Reset the simulation (remove all currently defined routes).
     */
    resetSimulation: function() {
        this._removeAllRoutes();
        this._generateTabs([{"user":"","origin":"","destination":"","travelmode":"DRIVING","speed":50,"frequency":5}]);
        this._activeSim = null;
        //maintain scroll position
        var scrollLeft = (typeof window.pageXOffset !== "undefined") ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft;
        var scrollTop = (typeof window.pageYOffset !== "undefined") ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
        setTimeout(function() {
            scrollTo(scrollLeft,scrollTop);
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
        voyent.io.docs[docCall](params).then(function() {
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
        voyent.io.docs.deleteDocument({realm:this.realm,collection:collection,id:simulationId}).then(function() {
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
        voyent.io.docs.findDocuments({realm:this.realm,collection:collection}).then(function(simulations) {
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
        var scrollLeft = (typeof window.pageXOffset !== "undefined") ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft;
        var scrollTop = (typeof window.pageYOffset !== "undefined") ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
        setTimeout(function() {
            scrollTo(scrollLeft,scrollTop);
        },50);
    },

    /**
     * Trigger the Google Map resize event and pan the map to the last known bounds.
     */
    resizeMap: function() {
        if (('google' in window) && this._map) {
            google.maps.event.trigger(this._map, "resize");
            this._map.fitBounds(this._bounds);
            this._map.panToBounds(this._bounds);
        }
    },


    //******************PRIVATE API******************

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
                if (location.properties && location.properties.zoneId) {
                    //ignore regions that are connected to zones since
                    //they will be retrieved when getting trackers
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
                    var color = properties.Color;
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
                    if (metadata.shape !== 'polygon') {
                        this._bounds.union(region.getBounds());
                    }
                    this._clickListener(region,data[i],metadata.shape);
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
                    this._clickListener(poi,data[i],type);
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
            var marker = new google.maps.Marker({
                position: latLng,
                map: _this._map,
                draggable: true,
                icon: _this.pathtoimages+'/images/user_marker.png'
            });
            _this._userLocationChangedListener(marker,location);
            _this._clickListener(marker,location,location.location.geometry.type.toLowerCase());
            _this._handleNewLocationMarker(location.username,marker);
        });
    },

    /**
     * Clear user locations, regions, and points of interest from the map.
     * @private
     */
    _clearLocationData: function() {
        this._locationMarkers.forEach(function(marker) {
            marker[Object.keys(marker)[0]].setMap(null);
        });
        this._locationMarkers = [];
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
     * Draw trackers and their associated zones on the map.
     * @param trackers
     * @private
     */
    _updateTrackers: function(trackers) {
        var _this = this;
        var googlePoint, zones, circle;

        var trackerData;

        //********** - INCIDENT DEMO SPECIFIC CODE START - **********
        voyent.io.scope.getRealmData({'property':'trackerData'}).then(function(data) {
            trackerData = data;
            processTrackers();
        }).catch(function(error) {
            if (error.status !== 404) {
                _this.fire('message-error', 'Failed retrieving message templates');
                console.error('Failed retrieving message templates:',error);
            }
        });
        //********** - INCIDENT DEMO SPECIFIC CODE END - **********

        function processTrackers() {
            for (var i=0; i<trackers.length; i++) {
                googlePoint = new google.maps.LatLng(trackers[i].anchor.geometry.coordinates[1],
                                                     trackers[i].anchor.geometry.coordinates[0]);

                //keep a reference to the trackers with their associated circle regions
                _this._trackers[trackers[i]._id] = {"tracker":trackers[i],"zones":[]};
                //process the tracker zones
                zones = trackers[i].zones.features;
                for (var j=0; j<zones.length; j++) {
                    //********** - INCIDENT DEMO SPECIFIC CODE START - **********
                    //save the tracker icon
                    if (trackerData[trackers[i].properties.zoneNamespace] &&
                        trackerData[trackers[i].properties.zoneNamespace][zones[j].properties.zoneId] &&
                        trackerData[trackers[i].properties.zoneNamespace][zones[j].properties.zoneId].global &&
                        trackerData[trackers[i].properties.zoneNamespace][zones[j].properties.zoneId].global.icon) {
                        trackers[i].properties.icon = _parseIconURL(trackerData[trackers[i].properties.zoneNamespace][zones[j].properties.zoneId].global.icon);
                    }
                    //********** - INCIDENT DEMO SPECIFIC CODE END - **********

                    circle = new google.maps.Circle({
                        'radius': zones[j].properties.googleMaps.radius,
                        'fillColor': zones[j].properties.Color,
                        'zIndex': zones[j].properties.googleMaps.zIndex,
                        'editable': false
                    });
                    //associate the zone with the tracker so we can sync them on movement
                    _this._trackers[trackers[i]._id].zones.push(circle);
                }
            }
        }

        //********** - INCIDENT DEMO SPECIFIC CODE START - **********
        function _parseIconURL(url) {
            var parts = url.split('/');
            var img = parts[parts.length-1];
            return img.replace('_inverted','');
        }
        //********** - INCIDENT DEMO SPECIFIC CODE END - **********
    },

    /**
     * Handles generating tabs for each route/vector and moving the routes into them.
     * @param routes
     * @param isInitialLoad
     * @private
     */
    _generateTabs: function(routes,isInitialLoad) {
        var _this = this;
        var children = [];
        if (routes && routes.length > 0) {
            //append the new routes as direct children of the component so they inherit any custom styling
            for (var j=0; j<routes.length; j++) {
                if (routes[j].tracker) {
                    //pass the map and trackers via the constructor (instead of via the events like markup defined components)
                    children.push(new Voyent.LocationVector(this._map, this._trackers, routes[j].label, routes[j].tracker, routes[j].bearing,
                        routes[j].speed, routes[j].speedunit, routes[j].duration, routes[j].frequency, false));
                }
                else {
                    //pass the map and users via the constructor (instead of via the events like markup defined components)
                    children.push(new Voyent.LocationRoute(this._map, this._users, routes[j].label, routes[j].user, routes[j].origin, routes[j].destination,
                        routes[j].travelmode, routes[j].speed, routes[j].speedunit, routes[j].frequency, routes === this.routes));
                }
                Polymer.dom(this).appendChild(children[children.length-1]);
            }
        }
        if (isInitialLoad) {
            //since it's the first time, make sure we include any routes defined as child components
            children = Polymer.dom(this).childNodes.filter(function(node) {
                return node.nodeName === 'VOYENT-LOCATION-ROUTE' || node.nodeName === 'VOYENT-LOCATION-VECTOR';
            });
        }
        if (children.length) {
            this.set('_contextMenuDisabled',children[0].nodeName === 'VOYENT-LOCATION-VECTOR');
            setTimeout(function () {
                //create tabs for the new children
                for (var k = 0; k < children.length; k++) {
                    _this.push('_children', {
                        "elem": children[k],
                        "tabClass": isInitialLoad && k === 0 ? "active" : "", //show first tab by default on initial load
                        "tabLabel": children[k].label || 'New Route',
                        "contentHidden": !(isInitialLoad && k === 0) //show first tab by default on initial load
                    });
                }
                //move new children into tabs (do this async so all the new children tabs are rendered first)
                setTimeout(function() {
                    var tabIsSelected=false;
                    //append the children to the content panel of each tab
                    for (var i=0; i<_this._children.length; i++) {
                        if (_this._children[i].tabClass === 'active') {
                            tabIsSelected = true;
                        }
                        Polymer.dom(_this.root).querySelector('div[data-index="'+i+'"]').appendChild(_this._children[i].elem); //move into tab
                    }
                    //if no tab is selected (eg. the previously selected tab was replaced) then select the first one
                    if (!tabIsSelected) {
                        _this.set('_children.0.tabClass','active');
                        _this.set('_children.0.contentHidden',false);
                    }
                },0);
            }, 0);
        }
    },

    /**
     * Remove all routes (user and tracker).
     * @private
     */
    _removeAllRoutes: function() {
        for (var i=this._children.length-1; i >= 0; i--) {
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
        voyent.io.admin.getRealmUsers({realmName:this.realm}).then(function(users) {
            var usernames = [];
            if (users && users.length > 0) {
                usernames = users.map(function(user) {
                    return user.username;
                });
                //add the current user to the list (they won't be included because the current user is an admin)
                usernames.unshift(voyent.io.auth.getLastKnownUsername());
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
            console.error('Error trying to get realm users:',error);
        });
    },

    /**
     * When a map overlay is clicked display an infoWindow with some relative information.
     * @param overlay
     * @param location
     * @param shape
     */
    _clickListener: function(overlay,location,shape) {
        var _this = this;
        if (!this._infoWindow) { //load "lazily" so google object is available
            this._infoWindow = new google.maps.InfoWindow();
        }
        //display infoWindow and hide context menu on map click
        google.maps.event.addListener(overlay, 'click', function () {
            var name = location.label || (location.properties ? (location.properties.zoneNamespace || location.properties.zoneId) : null) || location._id;
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
                var username = location.username ? location.username+'<br/>' : '';
                var date = location.lastUpdated ? new Date(location.lastUpdated).toLocaleString() : '';
                content = content+username+date+'</div>';
            }
            _this._infoWindow.setContent(content);
            _this._infoWindow.open(_this._map,overlay);
            _this._hideContextMenu = true;
        });
    },

    /**
     * When a new user is dropped on the map save them to the Location Service and setup required listeners.
     * @param drawingManager
     * @private
     */
    _setupNewLocationListener: function(drawingManager) {
        var _this = this;
        google.maps.event.addListener(drawingManager, 'markercomplete', function (marker) {
            marker.setIcon(_this.pathtoimages+'/images/'+_this._selectedBttn+'_marker.png');
            if (_this._selectedBttn === 'user') {
                var location = {
                    "location": {
                        "geometry": { "type" : "Point", "coordinates" : [marker.getPosition().lng(),marker.getPosition().lat()] }
                    },
                    "username": voyent.io.auth.getLastKnownUsername(),
                    "demoUsername": voyent.io.auth.getLastKnownUsername()
                };
                _this._handleNewLocationMarker(location.username,marker);
                voyent.io.locate.updateLocation({realm:_this.realm,location:location}).then(function(data) {
                    location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
                    _this._userLocationChangedListener(marker,location);
                    _this._clickListener(marker,location,location.location.geometry.type.toLowerCase());
                }).catch(function(error) {
                    _this.fire('message-error', 'Issue creating new location: ' + error);
                    console.error('Issue creating new location:',error);
                });
            }
            else {
                marker.setVisible(false);
                _this._renderIncidentMenu(marker);
            }
            _this._selectedIncident = null;
            _this._drawingManager.setDrawingMode(null);
        });
    },

    _renderIncidentMenu: function(marker) {
        //for some reason doing this as a computed binding in the
        //template doesn't work, so set the menuItems here instead
        this._incidentMenuItems = this._toArray(this._trackers).slice(0);
        for (var i=0; i<this._incidentMenuItems.length; i++) {
            //save a reference to the marker for later use
            this._incidentMenuItems[i]._marker = marker;
        }
        this.$.incidentMenu.style.height = 24*this._incidentMenuItems.length+'px';
        //render the context menu at the pixel coordinate
        var pos = this._returnPixelCoordinate(marker.getPosition());
        this.$.incidentMenu.style.left = pos.left + 'px';
        this.$.incidentMenu.style.top = pos.top + 'px';
        this._hideIncidentMenu = false;
    },

    _selectIncident: function(e) {
        var _this = this;
        this._hideIncidentMenu = true;

        var trackerObj = this._trackers[e.target.getAttribute('data-id')];
        var tracker = trackerObj.tracker;
        var zones = trackerObj.zones;
        var marker = e.model.item._marker;
        if (tracker.properties.icon) {
            marker.setIcon(_this.pathtoimages+'/images/'+tracker.properties.icon);
        }
        marker.setVisible(true);
        this._pointMarkers.push(marker);

        //now that we have a location save it in the tracker
        tracker.anchor.geometry.coordinates = [marker.getPosition().lng(),marker.getPosition().lat()];

        var location = {
            "location": {
                "geometry": { "type" : "Point", "coordinates" : [marker.getPosition().lng(),marker.getPosition().lat()] },
                "properties": {
                    "trackerId": tracker._id,
                    "zoneNamespace": tracker.properties.zoneNamespace
                }
            },
            "username": tracker._id,
            "demoUsername": tracker._id
        };
        this._handleNewLocationMarker(location.username,marker);

        for (var i=0; i<zones.length; i++) {
            // zones[i].setCenter(new google.maps.LatLng(location.location.geometry.coordinates[1],location.location.geometry.coordinates[0]))
            zones[i].setMap(this._map);
            this._clickListener(zones[i],tracker.zones.features[i],"circle");
            this._regions.push(zones[i]);
        }
        //set the bounds around this newly dropped tracker
        this._bounds = new google.maps.LatLngBounds();
        this._trackerMoved(tracker._id,marker);
        this._map.fitBounds(this._bounds);
        this._map.panToBounds(this._bounds);

        //add a new incident tab if one does not exist for this tracker
        var vectorTabs = this._children.filter(function(obj) {
            return obj.elem.nodeName === 'VOYENT-LOCATION-VECTOR' && obj.elem.tracker === tracker._id;
        });
        if (!vectorTabs.length) {
            this.addVector(tracker.properties.zoneNamespace,tracker._id);
        }

        voyent.io.locate.updateTrackerLocation({location: location}).then(function(data) {
            location.lastUpdated = new Date().toISOString(); //won't match server value exactly but useful for displaying in infoWindow
            _this._trackerLocationChangedListener(marker,tracker._id,location);
            _this._clickListener(marker,tracker,"point");

        }).catch(function (error) {
            _this.fire('message-error', 'Issue creating new incident: ' + tracker.properties.zoneNamespace);
            console.error('Issue creating new incident: ' + tracker.properties.zoneNamespace, error);
        });
    },

    /**
     * Setup listeners for the map context menu.
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
            _this._hideContextMenu = true;
            _this._hideIncidentMenu = true;
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
            //add click listener to new location marker
            _this._clickListener(e.detail.locationMarker,e.detail.location,'point');
            //add the location marker to the master list
            _this._handleNewLocationMarker(e.detail.location.username, e.detail.locationMarker);
            //create label for follow user menu
            if (e.detail.type === 'route') {
                e.detail.label = e.detail.child.label + (e.detail.child.user.trim().length > 0 ? ' ('+e.detail.child.user+')' : '');
            }
            else { //type ==== 'vector'
                e.detail.label = e.detail.child.label + (e.detail.child.tracker.trim().length > 0 ? ' ('+e.detail.child.tracker+')' : '');
            }
        });
        this.addEventListener('endSimulation', function(e) {

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

    _customBttnClicked:function(e) {
        document.querySelector('voyent-location-simulator')._selectedBttn = e.target.getAttribute('data-type');
        document.querySelector('voyent-location-simulator')._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
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
        //take into account the position of the map in the view and the position of the scrollbars
        var scrollLeft = (typeof window.pageXOffset !== "undefined") ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft;
        var scrollTop = (typeof window.pageYOffset !== "undefined") ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
        var left = pixelOffset.x + this._map.getDiv().getBoundingClientRect().left + scrollLeft;
        var top = pixelOffset.y + this._map.getDiv().getBoundingClientRect().top + scrollTop;
        return {"left":left,"top":top};
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
        for (var i=0; i<this._children.length; i++) {
            if (this._children[i] === e.model.item) {
                //check if this tab was active and if it is was select the first tab
                if (this._children[i].tabClass === 'active') {
                    this.set('_children.0.tabClass','active');
                    this.set('_children.0.contentHidden',false);
                }
                //delete route and remove tab
                Polymer.dom(this).removeChild(this._children[i].elem);
                this.splice('_children',i,1);
                break;
            }
        }
    },

    /**
     * Only keep the last location for each user.
     * @param username
     * @param marker
     * @private
     */
    _handleNewLocationMarker: function(username,marker) {
        if (this._locationMarkers.hasOwnProperty(username)) {
            this._locationMarkers[username].setMap(null);
            delete this._locationMarkers[username];
        }
        this._locationMarkers[username] = marker;
    },

    /**
     * Re-draw the routes and associated tabs when the `routes` attribute changes.
     * @param newVal
     * @param oldVal
     * @private
     */
    _routesChanged: function(newVal, oldVal) {
        //The initial attribute value triggers this observer before the ready is called, which is where we set the map and users. So if the map/users
        //are not set then the change event is for the initial value and we will ignore it (since the initial attribute value will be handled after
        //both the map and users are set, in the _mapOrUsersChanged observer).
        if (this._map && this._users && this.routes && this.routes.length > 0) {
            //first remove any children that were previously created via the routes attribute
            for (var i=this._children.length-1; i >= 0; i--) {
                if (this._children[i].elem.viaAttribute) {
                    Polymer.dom(this).removeChild(this._children[i].elem);
                    this.splice('_children',i,1);
                }
            }
            this._generateTabs(this.routes);
            //maintain scroll position
            var scrollLeft = (typeof window.pageXOffset !== "undefined") ? window.pageXOffset : (document.documentElement || document.body.parentNode || document.body).scrollLeft;
            var scrollTop = (typeof window.pageYOffset !== "undefined") ? window.pageYOffset : (document.documentElement || document.body.parentNode || document.body).scrollTop;
            setTimeout(function() {
                scrollTo(scrollLeft,scrollTop);
            },50);
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

    /**
     * Fired when the map and users properties are both set (since they are only changed on initial load).
     * @param map
     * @param users
     * @private
     */
    _mapOrUsersChanged: function(map,users) {
        this._children = [];
        this._generateTabs(this.routes,true);
        this.getSimulations();
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
     * Wrapper for `addVector(..)`.
     * @private
     */
    _addVector: function() {
        this.addVector();
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
        var simulation = window.prompt("Please enter the simulation name", "Auto-Named");
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
    }
});
