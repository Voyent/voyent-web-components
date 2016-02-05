var self;
var allRegions;
var allPOIs;
var allLocations;
var drawingManager;
var infoWindow;
var map;
var bounds;
var firstRun = true;
var setup = false;

Polymer({
    is: "bridgeit-location-editor",

    properties: {
        height: Number,
        width: Number,
        account: String,
        realm: String,
        host: String,
        accesstoken: String,
        searchBy: {type: String, value: 'locations', observer: 'changeSearchBy'},
        searchByTxt: {type: String, value: 'Location'},
        searchByNameVal: {type: String, value: 'locations'},
        searchByPropVal: {type: String, value: 'locationProperties'},
        searchByType: {type: String, value: 'nameVal'},
        searchType: {type: String, value: 'contains'},
        showSearchDialog: {type: Boolean, value: false},
        showImportDialog: {type: Boolean, value: false},
        showDeleteDialog: {type: Boolean, value: false},
        editablePropOpts: {type: Object, value: [true, false]},
        editableProp: {type: Boolean, value: true},
        colourPropOpts: {type: Object, value: ['Black', 'White', 'Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Pink', 'Purple']},
        colourProp: {type: String, value: 'Black'},
        newPropKey: {type: String, value: ''},
        newPropVal: {type: String, value: ''},
        newTag: {type: String, value: ''},
        regionProperties: {type: Object, value: [], notify: true},
        tags: {type: Object, value: []},
        locationNameInput: {type: String, value: ''},
        toggleCheckboxesTxt: {type: String, value: 'Select All'},
        placesSearchRank: {type: String, value: 'PROMINENCE', observer: 'placesSearchRankChanged'},
        placesRadiusDisabled: {type: Boolean, value: false},
        arePlacesSearchResults: {type: Boolean, value: false},
        placesSearchResults: {type: Object, value: [], observer: 'placesSearchResultsChanged'},
        placesSearchResultsMap: {type: Object, value: {}},
        allLocationsRadius: {type: Number, value: 20, observer: 'allLocationsRadiusChanged'},
        placesMonitors: {type: Object, value: []},
        newLocationIds: {type: Object, value: []},
        newPlacesLocationsCount: {type: Number, value: -1},
        toDeleteCount: {type: Number, value: -1},
        deletedCount: {type: Number, value: 0},
        matchingLocations: {type: Object, value: []},
        isPlacesSearch: {type: Boolean, value: false},
        locationImportCount: {type: Number, value: 0, observer: "locationImportCountChanged"},
        movesInRegion: {type: Boolean, value: false, observer: "movesInRegionChanged"},
        nearRegionPoi: {type: Boolean, value: false, observer: "nearRegionPoiChanged"},
        showPropertiesDiv: {type: Boolean, value: false},
        isPOI: {type: Boolean, value: false},
        currentId: {type: String, value: ''}

    },

    created: function () {
        _loc = this;
        _loc._locationMarkers = [];
        _loc._regions = [];
        _loc._poiMarkers = [];
        allRegions = {};
        allPOIs = {};
        allLocations = {};
    },

    ready: function () {
        window.initializeLocationsMap = function () {
            var lat, lng;
            //Sets map to user's current location if available
            if (navigator.geolocation) { //check if browser supports geolocation
                navigator.geolocation.getCurrentPosition(function (position) {
                        lat = position.coords.latitude;
                        lng = position.coords.longitude;
                        _loc._makeMap(lat, lng);
                    },
                    function (error) { //location not granted by user
                        initWithoutLoc();
                    });
            }
            else {
                initWithoutLoc();
            }
            function initWithoutLoc() { //geolocation was either not granted or not available in the browser so initialize map near ICEsoft
                lat = 51.06711;
                lng = -114.08534;
                _loc._makeMap(lat, lng);
            }
        };
        _loc.accesstoken = bridgeit.io.auth.getLastAccessToken();
        _loc.realm = bridgeit.io.auth.getLastKnownRealm();
        _loc.account = bridgeit.io.auth.getLastKnownAccount();
        _loc.host = bridgeit.io.auth.getConnectSettings().host;


        if (!('google' in window) || !('maps' in window.google)) {
            var script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = 'https://maps.googleapis.com/maps/api/js?v=3.2&' +
                'libraries=places,geometry,visualization,drawing&callback=initializeLocationsMap';
            _loc.$.container.appendChild(script);
        }
        else {
            initializeLocationsMap();
        }
    },


    _makeMap: function (lat, lng) {
        var height = _loc.height;
        var width = _loc.width;

        // if the height or width is not set on the component then set them here based on view size
        if (height == null) {
            height = _loc.$$("#container").clientHeight;
        }
        if (width == null) {
            width = _loc.$$("#container").clientWidth;
        }
        _loc.$$("#map").style.height = height + "px";
        _loc.$$("#map").style.width = width + "px";


        var mapOptions = {
            zoom: 14,
            center: new google.maps.LatLng(lat, lng),
            mapTypeControlOptions: {
                style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                position: google.maps.ControlPosition.RIGHT_TOP
            },
            signed_in: false,
            streetViewControl: false,
            panControl: false,
            zoomControlOptions: {
                style: google.maps.ZoomControlStyle.LARGE,
                position: google.maps.ControlPosition.LEFT_CENTER
            }
        };
        _loc._map = new google.maps.Map(_loc.$.map, mapOptions);
        map = _loc._map;
        _loc._bounds = new google.maps.LatLngBounds();
        _loc._infoWindow = new google.maps.InfoWindow();

        //make sure the map is sized correctly when the window size changes
        google.maps.event.addDomListener(window, "resize", function () {
            _loc.resizeMap();
        });

        _loc.drawingManager = new google.maps.drawing.DrawingManager({drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT,
            drawingModes: [
                google.maps.drawing.OverlayType.MARKER,
                google.maps.drawing.OverlayType.CIRCLE,
                google.maps.drawing.OverlayType.POLYGON,
                google.maps.drawing.OverlayType.RECTANGLE
            ]
        }});

        var promises = [];
        promises.push(bridgeit.io.location.getAllRegions({realm: _loc.realm}).then(function (regions) {
            _loc.regionsTemp = regions;
        }));
        promises.push(bridgeit.io.location.getAllPOIs({realm: _loc.realm}).then(function (pois) {
            _loc.poisTemp = pois;
        }));

        return Promise.all(promises).then(function () {
            _loc.startEditor(_loc.regionsTemp.concat(_loc.poisTemp));
        })['catch'](function (error) {
            console.log('<bridgeit-locations> Error: ' + ( error.message || error.responseText));
            console.log(error);
        });

    },

    startEditor: function (locationsData) {
        if (locationsData !== null && locationsData.length > 0) {
            _loc.makeLocations(locationsData);
        }

        _loc.addCustomButtons();
        setTimeout(function () {
            _loc.updateMainAutoComplete();
        }, 1000);

        _loc._infoWindow.setContent(_loc.$$('#infoWindow'));

        var searchBar = _loc.$$("#locationSearchBar");
        _loc.autoComplete = new Awesomplete(searchBar,{
            list:["Ada","Java","Starbucks","Python","Perl","Frisk"]
        });

        //listener fired when creating new locations
        google.maps.event.addListener(_loc.drawingManager, 'overlaycomplete', function (event) {
            var shape = event.type.toLowerCase();
            var geoJSON;
            var location = event.overlay;

            if (shape !== "marker") {
                location.setOptions({editable: true}); //always make region editable
                geoJSON = {
                    location: {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                ]
                            ]
                        },
                        "properties": {"googleMaps": {}, "Color": "Black", "Editable": "true"}
                    }
                };
            }
            else {
                location.setOptions({draggable: true}); //always make poi draggable
                geoJSON = {
                    location: {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": []
                        },
                        "properties": {"Editable": "true", "Proximity": 500}
                    }
                };
                shape = "point";
            }
            _loc.setupLocation(location, geoJSON, shape);
            _loc.drawingManager.setDrawingMode(null);

        });


        //if the escape key is pressed then stop drawing
        window.addEventListener("keydown",function (event) {
            if (event.which === 27) {
                if (_loc.drawingManager.getDrawingMode() !== null) {
                    _loc.drawingManager.setDrawingMode(null);
                }
            }
        });

        _loc.drawingManager.setMap(_loc._map);


        function SearchControl(controlDiv) {
            _loc.$$('#searchBarWrap').style.display = '';
            controlDiv.appendChild(
                _loc.$$('#searchBarWrap')
            );
        }

        var searchControlDiv = document.createElement('div');
        searchControlDiv.style.paddingLeft='30px';
        searchControlDiv.style.paddingTop='15px';
        searchControlDiv.style.width='30%';
        searchControlDiv.style.minWidth='630px';
        var searchControl = new SearchControl(searchControlDiv);

        searchControl.index = 1;
        _loc._map.controls[google.maps.ControlPosition.TOP_LEFT].push(searchControlDiv);

        //Clear region/poi name input on click when "Auto-Named"

        _loc.$$("#locationNameInput").addEventListener("click",function () {
            if (_loc.$$("#locationNameInput").value === "Auto-Named") {
                _loc.$$("#locationNameInput").value = "";
            }
        });
        setup = true;
    },

    /**
     * Resize the Google Map.
     */
    resizeMap: function () {
        if (('google' in window) && this._map) {
            var height = _loc.height;
            var width = _loc.width;

            // if the height or width is not set on the component then set them here based on view size
            if (height == null) {
                height = _loc.$$("#container").clientHeight;
            }
            if (width == null) {
                width = _loc.$$("#container").clientWidth;
            }
            _loc.$$("#map").style.height = height + "px";
            _loc.$$("#map").style.width = width + "px";
            var center = this._map.getCenter();
            google.maps.event.trigger(this._map, "resize");
            this._map.setCenter(center);
        }
    },

    refreshMap: function () {
        if (typeof google === 'undefined' || !_loc.realm) {
            return;
        }
        _loc._clearLocations();
        _loc._bounds = new google.maps.LatLngBounds();

        var promises = [];
        promises.push(bridgeit.io.location.getAllRegions({realm: _loc.realm}).then(function (regions) {
            _loc.regionsTemp = regions;
        }));
        promises.push(bridgeit.io.location.getAllPOIs({realm: _loc.realm}).then(function (pois) {
            _loc.poisTemp = pois;
        }));

        return Promise.all(promises).then(function () {
            var data = _loc.regionsTemp.concat(_loc.poisTemp);
            if (!setup)
                _loc.startEditor(data);
            else
                _loc.makeLocations(data, false);
        })['catch'](function (error) {
            console.log('<bridgeit-locations> Error: ' + ( error.message || error.responseText));
        });

    },

    _clearLocations: function () {
        _loc._locationMarkers.forEach(function (marker) {
            marker.setMap(null);
        });
        _loc._locationMarkers = [];

        _loc._regions.forEach(function (region) {
            region.setMap(null);
        });
        _loc._regions = [];

        _loc._poiMarkers.forEach(function (poi) {
            poi.setMap(null);
        });
        _loc._poiMarkers = [];
    },


    addCustomButtons: function () {
        setTimeout(function () {
            var pos = _loc.$$("#map").querySelectorAll(".gmnoprint");
            for (var i = 0; i < pos.length; i++) {
                var node = pos[i];
                if (node.children.length === 5 && getComputedStyle(node)["right"] === "0px") {
                    node.appendChild(_loc.$$('#searchAddButtonWrap'));
                    node.appendChild(_loc.$$('#importButtonWrap'));
                    _loc.$$('#searchAddButtonWrap').style.display = 'inline-block';
                    _loc.$$('#importButtonWrap').style.display = 'inline-block';
                }
            }
        }, 1500);
    },


    setupLocation: function (location, geoJSON, shape) {
        _loc.getCoordinates(location, geoJSON, shape);
        if (shape !== 'point') {
            _loc.postRegion(location, geoJSON, shape);
        }
        else {
            _loc.postPOI(location, geoJSON, shape);
        }
        _loc.infoWindowSetup(location, geoJSON, shape);
        setTimeout(function(){_loc.setupNameEdit();_loc.locationNameInput = "Auto-Named";},200);
        _loc.regionProperties = [];
    },

    getCoordinates: function (location, geoJSON, shape) {
        if (shape === 'circle') {
            var N = 50; //How many sides you want the circle approximation to have in our database.
            var degreeStep = 360 / N;
            geoJSON.location.properties.googleMaps.shape = "circle";
            geoJSON.location.properties.googleMaps.radius = location.getRadius();
            geoJSON.location.properties.googleMaps.center = [location.getCenter().lat(), location.getCenter().lng()];
            for (var i = 0; i < N; i++) {
                var gpos = google.maps.geometry.spherical.computeOffset(location.getCenter(), location.getRadius(), degreeStep * i);
                geoJSON.location.geometry.coordinates[0].push([gpos.lng(), gpos.lat()]);
                if (i + 1 === N) {
                    geoJSON.location.geometry.coordinates[0].push(geoJSON.location.geometry.coordinates[0][0]);
                }
            }

        }
        else if (shape === 'polygon') {
            geoJSON.location.properties.googleMaps.shape = "polygon";
            location.getPaths().forEach(function (pathGroup, pathGroupNum) {
                pathGroup.forEach(function (path, pathNum) {
                    geoJSON.location.geometry.coordinates[pathGroupNum][pathNum] = [path.lng(), path.lat()];
                });
                geoJSON.location.geometry.coordinates[pathGroupNum].push(geoJSON.location.geometry.coordinates[pathGroupNum][0]);
            });
        }
        else if (shape === 'rectangle') {
            geoJSON.location.properties.googleMaps.shape = "rectangle";
            var SWPoint = location.getBounds().getSouthWest();
            var NEPoint = location.getBounds().getNorthEast();
            geoJSON.location.geometry.coordinates[0].push([SWPoint.lng(), SWPoint.lat()]);
            geoJSON.location.geometry.coordinates[0].push([SWPoint.lng(), NEPoint.lat()]);
            geoJSON.location.geometry.coordinates[0].push([NEPoint.lng(), NEPoint.lat()]);
            geoJSON.location.geometry.coordinates[0].push([NEPoint.lng(), SWPoint.lat()]);
            geoJSON.location.geometry.coordinates[0].push([SWPoint.lng(), SWPoint.lat()]);
        }
        else if (shape === 'point') {
            geoJSON.location.geometry.coordinates.push(location.getPosition().lng(), location.getPosition().lat());
        }
    },

    postRegion: function (location, geoJSON, shape, isUpdate) {
        if (isUpdate) {
            bridgeit.io.location.updateRegion({
                realm: _loc.realm,
                region: geoJSON,
                id:geoJSON._id
            }).then(function (uri) {
                _loc.postLocationSuccess(uri, location, geoJSON, shape, isUpdate, "region");
            }).catch(function (error) {
                _loc.postLocationFail(location);
            });
        }
        else {
            bridgeit.io.location.createRegion({
                realm: _loc.realm,
                region: geoJSON
            }).then(function (uri) {
                _loc.postLocationSuccess(uri, location, geoJSON, shape, isUpdate, "region");
            }).catch(function (error) {
                console.log(error);
                _loc.postLocationFail(location);
            });
        }
    },
    postLocationSuccess: function (data, location, geoJSON, shape, isUpdate, type) {
        geoJSON._id = data ? data.split("/").pop() : geoJSON._id;
        allLocations[geoJSON._id] = [location, geoJSON];
        if (type === "region") {
            allRegions[geoJSON._id] = [location, geoJSON];
        }
        else {
            allPOIs[geoJSON._id] = [location, geoJSON];
        }
        if (!isUpdate) { //new location, so set up the gmap listeners
            _loc.setupListeners(location, geoJSON, shape);
        }
        if (_loc.isPlacesSearch) {
            //maintain an array of location ids for places search monitor creation
            var newLocationIds = _loc.newLocationIds;
            newLocationIds.push({'id': geoJSON._id, 'type': type});
        }
        else { //TODO: Places search doesn't currently add to autocomplete list.
            _loc.updateMainAutoComplete();
        }
    },
    postLocationFail: function (location) {
        //still push to the location ids array so the length of the array is maintained
        if (_loc.isPlacesSearch) {
            var newLocationIds = this.get('newLocationIds');
            newLocationIds.push(null);
        }
        console.log("error in adding location to database");
        location.setMap(null);
        location = null;
    },
    setupListeners: function (location, geoJSON, shape) {
        google.maps.event.addListener(location, 'click', function () {
            _loc.infoWindowSetup(location, geoJSON, shape);
        });

        if (shape === "polygon") {
            google.maps.event.addListener(location.getPath(), "insert_at", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
            google.maps.event.addListener(location.getPath(), "set_at", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
            google.maps.event.addListener(location.getPath(), "remove_at", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
        }
        else if (shape === "circle") {
            google.maps.event.addListener(location, "center_changed", function (event) {
                _loc.locationEdited(location, geoJSON, shape);

            });
            google.maps.event.addListener(location, "radius_changed", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
        }
        else if (shape === "rectangle") {
            google.maps.event.addListener(location, "bounds_changed", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
        }
        else if (shape === "point") {
            google.maps.event.addListener(location, "dragend", function (event) {
                _loc.locationEdited(location, geoJSON, shape);
            });
        }
    },

    locationEdited: function (location, geoJSON, shape) {
        geoJSON.location.geometry.coordinates = shape !== "point" ? [
            []
        ] : [];
        _loc.getCoordinates(location, geoJSON, shape);
        if (shape !== "point") {
            _loc.postRegion(location, geoJSON, shape, true);
        }
        else {
            _loc.postPOI(location, geoJSON, shape, true);
        }
    },

    postPOI: function (location, geoJSON, shape, isUpdate) {
        if (isUpdate) {
            bridgeit.io.location.updatePOI({
                realm: _loc.realm,
                poi: geoJSON,
                id:geoJSON._id
            }).then(function (uri) {
                _loc.postLocationSuccess(uri, location, geoJSON, shape, isUpdate, "POI");
            }).catch(function (error) {
                _loc.postLocationFail(location);
            });
        }
        else {
            bridgeit.io.location.createPOI({
                realm: _loc.realm,
                poi: geoJSON
            }).then(function (uri) {
                _loc.postLocationSuccess(uri, location, geoJSON, shape, isUpdate, "POI");
            }).catch(function (error) {
                _loc.postLocationFail(location);
            });
        }
    },

    infoWindowSetup: function (location, geoJSON, shape) {
        //set the active locations to the one that was clicked and cleanup old infoWindows
        _loc.activeGoogleLocation = location;
        _loc.activeLocation = geoJSON;
        _loc.isPOI = geoJSON.location.geometry.type.toLowerCase() === "point";
        if (_loc.showPropertiesDiv || _loc.showTagsDiv) {
            if (_loc.showPropertiesDiv) {
                _loc.togglePropertiesDiv();
                _loc.togglePropertiesDiv();

            }
            else {
                _loc.toggleTagsDiv();
                _loc.toggleTagsDiv();

            }
        }

        _loc._infoWindow.close();

        //set the new infoWindow position based on the type of location
        if (shape === "polygon") {
            _loc._infoWindow.setPosition(location.getPath().getAt(0));
        }
        else if (shape === "circle") {
            _loc._infoWindow.setPosition(location.getCenter());
        }
        else if (shape === "rectangle") {
            _loc._infoWindow.setPosition(location.getBounds().getNorthEast());
        }
        else { //shape === "point")
            _loc._infoWindow.setPosition(location.getPosition());
        }
        _loc._infoWindow.open(map, location);
        setTimeout(function () {
            _loc.$$('#infoWindow').style.display = "block"; //unhide the infoWindow div
            _loc.$$("#locationName").style.fontSize = "30px";
            _loc.$$("#locationName").text = geoJSON.label ? geoJSON.label : geoJSON._id; //display the id if the label hasn't been set yet
            _loc.revertNameEdit(); //start the infoWindow with an uneditable name and resize it if necessary
        },0)
    },

    setupNameEdit: function () {
        _loc.$$('#staticLocationName').style.display = 'none';
        _loc.$$('#editLocationName').style.display = '';
        _loc.locationNameInput = _loc.activeLocation.label ? _loc.activeLocation.label : _loc.activeLocation._id; //display the id if the label hasn't been set yet
    },

    revertNameEdit: function () {
        var geoJSON = this.get('activeLocation');
        _loc.$$('#editLocationName').style.display = 'none';
        _loc.$$('#staticLocationName').style.display = '';
        _loc.$$('#locationName').textContent= geoJSON.label ? geoJSON.label : geoJSON._id; //display the id if the label hasn't been set yet
        _loc.setupLocationIdPopover(); //Setup the location ID popover
        _loc.adjustLocationFontSize();
    },

    setupViewID: function () {
        _loc.$$('#staticLocationName').style.display = 'none';
        _loc.$$('#viewId').style.display = '';
        _loc.currentId = _loc.activeLocation._id;
        _loc.adjustIdFontSize();
    },

    revertViewID: function () {
        _loc.$$('#viewId').style.display = 'none';
        _loc.$$('#staticLocationName').style.display = '';
    },

    adjustLocationFontSize: function () {
        var elem = _loc.$$("#locationName");
        _loc.adjustFontSize(elem);

    },

    adjustIdFontSize: function () {
        var elem = _loc.$$("#viewIDDiv");
        _loc.adjustFontSize(elem);
    },

    adjustFontSize:function(elem){
        var fontstep = 1;
        var fontsize = parseInt(getComputedStyle(elem)["font-size"].split('px')[0]);
        var elementHeight = elem.offsetHeight;
        var parentHeight = elem.parentNode.offsetHeight;
        var elementWidth = elem.offsetWidth;
        var parentWidth =  elem.parentNode.offsetWidth;
        if ( elementHeight > parentHeight || elementWidth > parentWidth) {
            fontsize = fontsize - fontstep;
            elem.style.fontSize = fontsize + 'px';
            elementHeight = elem.offsetHeight;
            elementWidth = elem.offsetWidth;
            if ((elementHeight> parentHeight || elementWidth > parentWidth) && fontsize > 9) { //don't decrease the font size past 9px
                _loc.adjustFontSize(elem);
            }
        }
        else {
            fontsize = fontsize + fontstep;
            elem.style.fontSize = fontsize + 'px';
            elementHeight = elem.offsetHeight;
            elementWidth = elem.offsetWidth;
            if ((elementHeight < parentHeight || elementWidth < parentWidth) && fontsize < 30) { //don't increase the font size past 30px
                _loc.adjustFontSize(elem);
            }
        }
    },

    confirmNameChange: function () {
        var geoJSON = _loc.activeLocation;
        var newLocationName = _loc.locationNameInput;
        var oldLocationName = geoJSON.label ? geoJSON.label : geoJSON._id; //display the id if the label hasn't been set yet
        if (newLocationName !== oldLocationName && newLocationName !== "Auto-Named" && newLocationName.trim() !== "") {
            geoJSON.label = newLocationName;
            if (!_loc.isPOI) {
                _loc.postRegion(_loc.activeGoogleLocation, geoJSON, geoJSON.location.properties.googleMaps.shape, true);
            }
            else {
                _loc.postPOI(_loc.activeGoogleLocation, geoJSON, "point", true);
            }
        }
        _loc.revertNameEdit();
    },

    populateProperties: function () {
        var geoJSON = _loc.activeLocation;
        var properties = geoJSON.location.properties;
        setTimeout(function () {
            if (!(_loc.isPOI)) {
                _loc.colourProp = properties["Color"];
                var colourSelect = _loc.$$("#colourSelect");
                colourSelect.options[colourSelect.selectedIndex].removeAttribute("selected");
                _loc.$$("#colourSelect").querySelector('option[value="' + _loc.colourProp + '"]').setAttribute("selected", "selected");
            }
            _loc.editableProp = typeof properties["Editable"] === "undefined" ? true : properties["Editable"];
            var editableSelect = _loc.$$("#editableSelect");
            editableSelect.options[editableSelect.selectedIndex].removeAttribute("selected");
            _loc.$$("#editableSelect").querySelector('option[value="' + _loc.editableProp + '"]').setAttribute("selected", "selected");
            var props = [];
            for (var property in properties) {
                if (property !== "googleMaps" && property.toLowerCase() !== "color" && property.toLowerCase() !== "editable" && property.toLowerCase() !== 'tags') {
                    props.push({key: property, val: properties[property]});
                }
            }
            _loc.regionProperties = props;
        }, 100);
    },

    populateTags: function () {
        var locationTags = !_loc.activeLocation.location.properties.tags ? [] : _loc.activeLocation.location.properties.tags;
        var tags = [];
        for (var i = 0; i < locationTags.length; i++) {
            tags.push({name: locationTags[i]});
        }
        _loc.tags = tags;
    },

    updateProperties: function () {
        var location = _loc.activeGoogleLocation;
        var geoJSON = _loc.activeLocation;
        geoJSON.location.properties = _loc.preparePropertiesForPOST(null);
        var shape = geoJSON.location.geometry.type.toLowerCase();
        if (!_loc.isPOI) {
            _loc.postRegion(location, geoJSON, shape, true);
        }
        else {
            _loc.postPOI(location, geoJSON, shape, true);
        }
    },

    updateTags: function () {
        var location = _loc.activeGoogleLocation;
        var geoJSON = _loc.activeLocation;
        var tags = [];
        var newTags = _loc.tags;
        var shape = geoJSON.location.geometry.type.toLowerCase();
        if (newTags !== null && newTags.length > 0) {
            for (var i = 0; i < newTags.length; i++) {
                var tag = newTags[i]['name'];
                tags.push(tag);
            }
        }
        if (tags.length === 0) {
            delete geoJSON.location.properties.tags;
        }
        else {
            geoJSON.location.properties.tags = tags;
        }
        if (!_loc.isPOI) {
            _loc.postRegion(location, geoJSON, shape, true);
        }
        else {
            _loc.postPOI(location, geoJSON, shape, true);
        }
    },

    updateMainAutoComplete: function () {
        var autocomplete = _loc.autoComplete;
        var list = [];
        var contains = [];
        _loc.hideAndShowInputs();
        if (_loc.searchBy !== 'map') {
            if (_loc.searchByTxt.indexOf('Location') !== -1) {
                for (var key in allLocations) {
                    var obj = allLocations[key];
                    if (_loc.searchBy.indexOf('Properties') !== -1) {
                        for (var propertyKey in obj[1].location.properties) {
                            var propertyCombo = propertyKey + ":" + obj[1].location.properties[propertyKey];
                            if (contains.indexOf(propertyCombo) == -1) {
                                list.push(propertyCombo);
                                contains.push(propertyCombo);
                            }
                        }
                    }
                    else {
                        //Not properties, so search names.
                        if (obj[1].label !== null) {
                            if (contains.indexOf(obj[1].label) == -1) {
                                list.push(obj[1].label);
                                contains.push(obj[1].label);
                            }
                        }
                    }
                }
            }
            else if (_loc.searchByTxt.indexOf('Region') !== -1) {
                for (var key in allRegions) {
                    var obj = allRegions[key];
                    if (_loc.searchBy.indexOf('Properties') !== -1) {
                        for (var propertyKey in obj[1].location.properties) {
                            var propertyCombo = propertyKey + ":" + obj[1].location.properties[propertyKey];
                            if (contains.indexOf(propertyCombo) == -1) {
                                list.push(propertyCombo);
                                contains.push(propertyCombo);
                            }
                        }
                    }
                    else {
                        //Not properties, so search names.
                        if (obj[1].label !== null) {
                            if (contains.indexOf(obj[1].label) == -1) {
                                list.push(obj[1].label);
                                contains.push(obj[1].label);
                            }
                        }
                    }
                }
            }
            else if (_loc.searchByTxt.indexOf('POI') !== -1) {
                for (var key in allPOIs) {
                    var obj = allPOIs[key];
                    if (_loc.searchBy.indexOf('Properties') !== -1) {
                        for (var propertyKey in obj[1].location.properties) {
                            var propertyCombo = propertyKey + ":" + obj[1].location.properties[propertyKey];
                            if (contains.indexOf(propertyCombo) == -1) {
                                list.push(propertyCombo);
                                contains.push(propertyCombo);
                            }
                        }
                    }
                    else {
                        //Not properties, so search names.
                        if (obj[1].label !== null) {
                            if (contains.indexOf(obj[1].label) == -1) {
                                list.push(obj[1].label);
                                contains.push(obj[1].label);
                            }
                        }
                    }
                }
            }
            autocomplete.list = list;
        }

    },

    /**
     * Determines which autocomplete input should be shown in the main bar. This changes based on what locations are visible on the map (all,regions,pois) or by manually changing searchBy using the search options dialog. Also, re-initializing typeahead causes the the inputs to re-render, so we need to make sure we only show the currently relevant one.
     */
    hideAndShowInputs: function () {

         var searchBy = _loc.searchBy;
         var mapQueryAutocomplete = _loc.mapQueryAutocomplete;

        _loc.$$('#locationSearchBar').style.display = 'none';
        _loc.$$('#locationSearchBar').parentNode.style.display = 'none';
        _loc.$$('#mapSearchBar').style.display = 'none';

         if (searchBy === 'map') {
            _loc.$$('#mapSearchBar').style.display = 'inline-block';
            _loc.$$("#mapSearchBar").focus();
            if (typeof mapQueryAutocomplete === "undefined" || mapQueryAutocomplete === null) {
                mapQueryAutocomplete = new google.maps.places.Autocomplete(_loc.$$("#mapSearchBar"), {bounds: map.getBounds()});
                mapQueryAutocomplete.bindTo('bounds', map); //bias the results to the map's viewport, even while that viewport changes.
                _loc.mapQueryAutocomplete = mapQueryAutocomplete;
            }
             var enterFunction= function (event) {
                 if (event.which === 13) {
                     _loc.querySearch('');
                 }
             };
             var doubleFunction = function () {
                 _loc.$$('#mapSearchBar').setAttribute('value','');
             }
            _loc.$$('#mapSearchBar').removeEventListener('keyup',enterFunction);
            _loc.$$('#mapSearchBar').addEventListener('keyup',enterFunction);
            _loc.$$('#mapSearchBar').removeEventListener('dblclick', doubleFunction);
            _loc.$$('#mapSearchBar').addEventListener('dblclick',doubleFunction);
            google.maps.event.addListener(mapQueryAutocomplete, 'place_changed', function () {
                _loc.querySearch('');
            });
        }
        else {
            _loc.$$('#locationSearchBar').parentNode.style.display = 'inline-block';
            _loc.$$('#locationSearchBar').style.display = 'inline-block';
            _loc.$$("#locationSearchBar").focus();
        }

    },

    toggleDeleteDialog: function () {
        _loc.showDeleteDialog = !_loc.showDeleteDialog;
        _loc.toggleCheckboxesTxt = 'Select All';
        _loc.querySearch('', false);
        if (_loc.showDeleteDialog) {
            setTimeout(function () {

                var pos = _loc.$$("#massDeleteContainer").querySelectorAll(".locationName");
                for (var i = 0; i < pos.length; i++) {
                    pos[i].addEventListener("mouseover",function () {
                        var id = this.getAttribute('title');
                        var coords;
                        var selectedLocation;
                        var type;
                        if (typeof allRegions[id] !== "undefined") {
                            selectedLocation = allRegions[id][0];
                            type = allRegions[id][1].location.properties.googleMaps.shape.toLowerCase();
                            selectedLocation.setOptions({fillOpacity: 0.9});
                        }
                        else {
                            selectedLocation = allPOIs[id][0];
                            type = 'point';
                            //TODO:Figure out if we can make the reference to the marker image relative
                            //selectedLocation.setIcon('/css/green-marker.png');
                        }
                        if (type === "polygon") {
                            coords = selectedLocation.getPath().getAt(0);
                        }
                        else if (type === "circle") {
                            coords = selectedLocation.getCenter();
                        }
                        else if (type === "rectangle") {
                            coords = selectedLocation.getBounds().getCenter();
                        }
                        else { //type === point
                            coords = selectedLocation.getPosition();
                        }
                        //pan to the location if it's not in the view
                        if (!_loc._map.getBounds().contains(coords)) {
                            _loc._map.panTo(coords);
                        }
                    });
                    pos[i].addEventListener("mouseout",function () {
                        var id = this.getAttribute('title');
                        if (typeof allRegions[id] !== "undefined") {
                            allRegions[id][0].setOptions({fillOpacity: 0.4});
                        }
                        else {
                            allPOIs[id][0].setIcon(null);
                        }
                    });
                }
            }, 100);
        }
    },

    massDeleteLocations: function () {
        //var locations = $('input[name="location"]:checked').map(function () {
        //    return this.value;
        //}).get();
        var rawLocations = document.querySelectorAll('input[name="massDeleteLocation"]:checked');
        var locations = [];
        for (var i = 0; i < rawLocations.length; i++){
            locations.push(rawLocations[i].getAttribute("value"));
        }
        if (locations.length > 0) {
            _loc.toDeleteCount = locations.length;
            _loc.isMassDelete = true;
            var id;
            for (var i = 0; i < locations.length; i++) {
                id = locations[i];
                if (typeof allRegions[id] !== "undefined") {
                    _loc.deleteRegion(allRegions[id][0], allRegions[id][1]);
                }
                else {
                    _loc.deletePOI(allPOIs[id][0], allPOIs[id][1]);
                }
            }
            _loc.showDeleteDialog = !_loc.showDeleteDialog;
        }
    },

    toggleSearchOptDialog: function () {
        _loc.showSearchDialog = !_loc.showSearchDialog;
    },

    allLocationsDeleted: function () {
        _loc.updateMainAutoComplete(); //now that all delete operations are complete, update the autocomplete
        _loc.isMassDelete = false;
        _loc.deletedCount = 0;
        _loc.toDeleteCount = -1; //reset delete popup related variables
    },

    addProperty: function () {

        var newPropKey = _loc.newPropKey;
        var newPropVal = _loc.newPropVal;
        if (!newPropKey || newPropKey.toString().trim().length === 0) {
            console.log('Please enter a property name.');
            return;
        }
        if (!newPropVal || newPropVal.toString().trim().length === 0) {
            console.log('Please enter a property value.');
            return;
        }

        _loc.push('regionProperties', {key: newPropKey, val: newPropVal});
        if (!_loc.isPlacesSearch) {
            _loc.updateProperties();
        }
        _loc.newPropKey = '';
        _loc.newPropVal = '';
    },
    removeProperty: function (e) {
        var propToRemove = e.model.item;
        var properties = _loc.regionProperties;
        for (var i = 0; i < properties.length; i++) {
            if (propToRemove['key'] === properties[i]['key']) {
                e.target.remove();
                _loc.splice('regionProperties', i, 1);
                break;
            }
        }
        if (!_loc.isPlacesSearch) {
            _loc.updateProperties();
        }
    },

    addTag: function () {
        var newTag = _loc.newTag;
        if (!newTag || newTag.toString().trim().length === 0) {
            console.log('Please enter a tag.');
            return;
        }
        _loc.push('tags', {name: newTag});
        if (!_loc.isPlacesSearch) {
            _loc.updateTags();
        }
        _loc.newTag = '';
    },

    removeTag: function (e) {
        var tagToRemove = e.model.item.name;
        var tags = _loc.tags;
        for (var i = 0; i < tags.length; i++) {
            if (tagToRemove === tags[i]['name']) {
                e.target.remove();
                _loc.splice('tags', i, 1);
                break;
            }
        }
        _loc.tags = tags;
        if (!_loc.isPlacesSearch) {
            _loc.updateTags();
        }
    },
    updateColourProperty: function () {
        var selector = _loc.$$("#colourSelect")
        _loc.colourProp = selector.options[selector.selectedIndex].text;
        var location = _loc.activeLocation;
        allLocations[location._id][0].setOptions({fillColor: _loc.colourProp});
        _loc.updateProperties();
    },

    updateEditableProperty: function () {
        var location = _loc.activeLocation;
        var selector = _loc.$$("#editableSelect");
        _loc.editableProp = selector.options[selector.selectedIndex].getAttribute("value");
        var editableProp = (_loc.editableProp.toLowerCase() === 'true' || _loc.editableProp === true);
        if (_loc.isPOI) {
            allPOIs[location._id][0].setDraggable(editableProp);
            allLocations[location._id][0].setDraggable(editableProp);
        }
        else {
            allRegions[location._id][0].setEditable(editableProp);
            allLocations[location._id][0].setEditable(editableProp);
        }
        _loc.updateProperties();
    },

    removeLocation: function () {
        if (!_loc.isPOI) {
            _loc.deleteRegion(_loc.activeGoogleLocation, _loc.activeLocation);
        }
        else {
            _loc.deletePOI(_loc.activeGoogleLocation, _loc.activeLocation);
        }
    },

    togglePropertiesDiv: function () {
        setTimeout(function () {
            if (!_loc.showTagsDiv) {
                var newHeight = _loc.$$('#infoWindow').offsetHeight == 305 ? "100px" : "305px";
                _loc.$$('#infoWindow').style.height = newHeight;
            }
            _loc.isPlacesSearch = false;
            _loc.showPropertiesDiv = !_loc.showPropertiesDiv;
            if (_loc.showPropertiesDiv) {
                _loc.populateProperties();
                _loc.showTagsDiv = false;
            }
        },50);
    },

    togglePlacesPropertiesDiv: function () {
        _loc.isPlacesSearch = true;
        _loc.showPlacesPropertiesDiv = !_loc.showPlacesPropertiesDiv;
        if (_loc.showPlacesPropertiesDiv) {
            _loc.showPlacesTagsDiv = false;
        }
    },

    toggleTagsDiv: function () {
        setTimeout(function () {
        if (!_loc.showPropertiesDiv) {
            var newHeight = getComputedStyle(_loc.$$('#infoWindow'))['height'] == "305px" ? "100px" : "305px";
            _loc.$$('#infoWindow').style.height= newHeight;
        }
        _loc.isPlacesSearch = false;
        _loc.showTagsDiv = !_loc.showTagsDiv;
        if (_loc.showTagsDiv) {
            _loc.populateTags();
            _loc.showPropertiesDiv = false;
        }},50);
    },

    togglePlacesTagsDiv: function () {
        _loc.isPlacesSearch = true;
        _loc.showPlacesTagsDiv = !_loc.showPlacesTagsDiv;
        if (_loc.showPlacesTagsDiv) {
            _loc.showPlacesPropertiesDiv = false;
        }
    },

    toggleCheckboxes: function (checkboxType) {
        //var pos = _loc.$$("#map").querySelectorAll(".gmnoprint");
        //for (var i = 0; i < pos.length; i++) {
        checkboxType = "matchingLocations";
        var objects = _loc.matchingLocations;
        var checked;
        if (_loc.toggleCheckboxesTxt === 'Select All') {
            checked = true;
            _loc.toggleCheckboxesTxt = 'Select None';
        }
        else {
            checked = false;
            _loc.toggleCheckboxesTxt = 'Select All';
        }
        for (var i = 0; i < objects.length; i++) {
            var value = checkboxType === 'locations' || checkboxType === 'matchingLocations' ? objects[i].id : objects[i].index;
            _loc.$$('input[value="' + value + '"]').checked= checked;
        }
//always select the currently active location in the monitor location list
        if (checkboxType === 'locations' && !_loc.isPlacesSearch) {
            _loc.$$('input[value="' + _loc.activeLocation._id + '"]').checked = true;
        }
    },

    setupLocationIdPopover: function () {

    },

    clearFilterButton: function (e) {
        _loc.$$('#locationSearchBar').value ="";
        _loc.querySearch();
    },

    toggleLocations: function () {
        var locationId, googleLocation;
        if (_loc.searchByTxt.indexOf('Location') !== -1) {
            _loc.searchByTxt = 'Region';
            _loc.searchByNameVal = 'regions';
            _loc.searchByPropVal = 'regionProperties';
            for (locationId in allPOIs) {
                googleLocation = allPOIs[locationId][0];
                googleLocation.setMap(null);
            }
        }
        else if (_loc.searchByTxt.indexOf('Region') !== -1) {
            _loc.searchByTxt = 'POI';
            _loc.searchByNameVal = 'pois';
            _loc.searchByPropVal = 'poiProperties';
            for (locationId in allPOIs) {
                googleLocation = allPOIs[locationId][0];
                googleLocation.setMap(_loc._map);
            }
            for (locationId in allRegions) {
                googleLocation = allRegions[locationId][0];
                googleLocation.setMap(null);
            }
        }
        else if (_loc.searchByTxt.indexOf('POI') !== -1) {
            _loc.searchByTxt = 'Location';
            _loc.searchByNameVal = 'locations';
            _loc.searchByPropVal = 'locationProperties';
            for (locationId in allRegions) {
                googleLocation = allRegions[locationId][0];
                googleLocation.setMap(_loc._map);
            }
        }

        if (_loc.searchBy.indexOf('Properties') === -1) {
            _loc.searchBy = _loc.searchByNameVal;
        }
        else {
            _loc.searchBy = _loc.searchByPropVal;
        }
        _loc.showDeleteDialog = false;
        //_loc.updateMainAutoComplete();
    },

    querySearch: function (optionalQuery, exactMatch) {
        var searchQuery;
        var searchBy = _loc.searchBy;
        var mapQueryAutocomplete = _loc.mapQueryAutocomplete;
        var googleLocation;
        var locationId;
        var locationName;
        var geoJSON;
        var properties;
        var propName;
        var matchingLocations = [];
        var matchFound = false;
        var locationList;


        if (typeof optionalQuery == "object") {
            optionalQuery = '';
            exactMatch = false;
        }

        //if (searchBy === 'locations' || searchBy === 'locationProperties') {locationList=jQuery.extend({},allRegions,allPOIs);}
        if (searchBy === 'locations' || searchBy === 'locationProperties') {
            locationList = allLocations;
        }
        else if (searchBy === 'regions' || searchBy === 'regionProperties') {
            locationList = allRegions;
        }
        else {
            locationList = allPOIs;
        }

        if (searchBy === 'locations' || searchBy === 'regions' || searchBy === 'pois') {
            searchQuery = optionalQuery ? optionalQuery.value : _loc.$$("#locationSearchBar").value;
            for (locationId in locationList) {
                googleLocation = locationList[locationId][0];
                locationName = locationList[locationId][1].label ? locationList[locationId][1].label : locationList[locationId][1]._id; //use the id to search if the label hasn't been set yet
                matchFound = _loc.compareStrings(locationName, searchQuery, exactMatch, false);
                if (matchFound) {
                    googleLocation.setMap(_loc._map); //set location on map
                    matchingLocations.push({'id': locationId, 'name': locationName});
                }
                else {
                    googleLocation.setMap(null); //remove location from map
                }
            }
        }
        else if (searchBy.indexOf('Properties') !== -1) { //searchBy === 'locationProperties' || 'regionProperties' || 'poiProperties'
            searchQuery = optionalQuery ? optionalQuery.value : _loc.$$("#locationSearchBar").value;
            for (locationId in locationList) {
                googleLocation = locationList[locationId][0];
                geoJSON = locationList[locationId][1];
                properties = geoJSON.location.properties;
                locationName = geoJSON.label ? geoJSON.label : geoJSON._id; //use the id to search if the label hasn't been set yet
                        var targetName = searchQuery.split(":")[0];
                        var targetValue = searchQuery.split(":")[1];
                        if (geoJSON.location.properties[targetName] === targetValue) {
                            googleLocation.setMap(_loc._map); //set location on map
                            matchingLocations.push({'id': locationId, 'name': locationName});
                        }
                        else {
                            googleLocation.setMap(null); //remove location from map
                        }
            }
        }
        else { // searchBy === "map"
            searchQuery = _loc.$$("#mapSearchBar").value;
            if (searchQuery && searchQuery.trim().length > 0) {
                var geocoder = new google.maps.Geocoder();
                var location = _loc._map.getCenter();
                geocoder.geocode({'address': searchQuery, 'location': location}, function (results, status) {
                    if (status === google.maps.GeocoderStatus.OK) {
                        _loc._map.fitBounds(results[0].geometry.viewport);
                        _loc._map.setCenter(results[0].geometry.location);
                        mapQueryAutocomplete.setBounds(results[0].geometry.viewport);
                        _loc.mapQueryAutocomplete = mapQueryAutocomplete;
                    } else {
                        console.log('Geocode was not successful for the following reason: ' + status);
                    }
                });
            }
        }
        _loc.matchingLocations = matchingLocations;
    },

    /**
     * Toggles the visibility of the places search dialog. If the dialog is opened with results then make sure the listeners are added to the input elements.
     */
    togglePlacesSearch: function () {
        _loc.showPlacesDialog = !_loc.showPlacesDialog;
        if (_loc.showPlacesDialog) {
            _loc.isPlacesSearch = true;
            if (_loc.placesSearchResults.length > 0) {
                _loc.placesSearchResultsChanged();
            }
            else {
                setTimeout(function () {
                    _loc.setupPlacesAutocomplete();
                }, 0);
            }
        }
        _loc.drawingManager.setDrawingMode(null);
    },

    /**
     * Clears the input fields in the Places Search popup
     */
    clearPlacesSearch: function () {
        _loc.placesName = '';
        _loc.placesTypes = '';
        _loc.placesKeyword = '';
        _loc.placesRadius = '';
    },

    /**
     * Setup the Places name input as an autocomplete field
     */
    setupPlacesAutocomplete: function () {
        var placesAutocomplete = new google.maps.places.Autocomplete(_loc.$$("#placesName"), {bounds: _loc._map.getBounds()});
        google.maps.event.addListener(placesAutocomplete, 'place_changed', function () {
            var place = placesAutocomplete.getPlace();
            _loc.placesName = '';
            setTimeout(function () {
                _loc.placesName = place.name;
            }, 0);
        });
    },

    /**
     * Go back to the Places Search from the Places Search Results Page
     */
    backToPlacesSearch: function () {
        _loc.placesSearchResults = [];
        _loc.placesSearchResultsMap = {};
        _loc.allLocationsRadius = 20;
        _loc.arePlacesSearchResults = false;
        setTimeout(function () {
            _loc.setupPlacesAutocomplete();
        }, 0);
    },

    /**
     * Initiates a Google Places Search of type nearbySearch. If there is more than one page of results then they will be immediately requested and appended to the results list.
     */
    placesSearch: function () {
        var service = new google.maps.places.PlacesService(_loc._map);
        var placesName = _loc.placesName;
        var placesTypes = _loc.placesTypes;
        var placesKeyword = _loc.placesKeyword;
        var placesSearchRank = _loc.placesSearchRank;
        var placesRadius = _loc.placesRadius;
        _loc.placesSearchStatus = '';
        placesSearchRank = _loc.$$("input[name='placesSearchRank']:checked").value;
        if (placesSearchRank === 'DISTANCE') {
            if ((!placesName || placesName.toString().trim().length === 0) &&
                (!placesTypes || placesTypes.toString().trim().length === 0) &&
                (!placesKeyword || placesKeyword.toString().trim().length === 0)) {
                console.log('When RankBy.DISTANCE is specified, one or more of keyword, name, or types is required.');
                return;
            }
        }
        if (placesTypes && placesTypes.toString().trim().length > 0 && !placesTypes.match("^[a-z_,]*$")) {
            console.log('Places Types must be a comma separated list of values.');
            return;
        }
        var request = {'location': _loc._map.getCenter()};
        if (placesName && placesName.toString().trim().length > 0) {
            request.name = placesName;
        }
        if (placesTypes && placesTypes.toString().trim().length > 0) {
            request.types = placesTypes.toLowerCase().split(',');
        }
        if (placesKeyword && placesKeyword.toString().trim().length > 0) {
            request.keyword = placesKeyword;
        }
        _loc.placesSearchRank = placesSearchRank;
        if (placesSearchRank === 'PROMINENCE') {
            request.rankBy = google.maps.places.RankBy.PROMINENCE;
            if (placesRadius) {
                request.radius = placesRadius;
            }
            else {
                request.radius = 10000;
            }
        }
        else {
            request.rankBy = google.maps.places.RankBy.DISTANCE;
        }
        try {
            service.nearbySearch(request, callback);
        }
        catch (err) {
            _loc.placesSearchStatus = err;
        }

        var searchResults = [];

        function callback(results, status, pagination) {
            if (status !== google.maps.places.PlacesServiceStatus.OK) {
                if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    _loc.placesSearchStatus = 'No result was found for this request.';
                }
                else if (status === google.maps.places.PlacesServiceStatus.ERROR) {
                    _loc.placesSearchStatus = 'There was a problem contacting the Google servers.';
                }
                else if (status === google.maps.places.PlacesServiceStatus.INVALID_REQUEST) {
                    _loc.placesSearchStatus = 'This request was invalid.';
                }
                else if (status === google.maps.places.PlacesServiceStatus.OVER_QUERY_LIMIT) {
                    _loc.placesSearchStatus = 'The webpage has gone over its request quota.';
                }
                else if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
                    _loc.placesSearchStatus = 'The webpage is not allowed to use the PlacesService.';
                }
                else if (status === google.maps.places.PlacesServiceStatus.UNKNOWN_ERROR) {
                    _loc.placesSearchStatus = 'The PlacesService request could not be processed due to a server error. The request may succeed if you try again.';
                }
                return;
            }

            searchResults = searchResults.concat(results);

            if (pagination && pagination.hasNextPage) {
                pagination.nextPage();
            }
            else {
                //save the search results into an object so we can easily retrieve the data by place_id later (instead of having to iterate each time)
                var placesSearchResultsMap = {};
                searchResults.forEach(function (o) {
                    placesSearchResultsMap[o.place_id] = o;
                });
                _loc.placesSearchResults = searchResults; //used to populate the view (Ember can't render iteratively using an object (eg. placesSearchResultsMap) inside template)
                _loc.placesSearchResultsMap = placesSearchResultsMap; //we use this to quickly find PlaceResult objects by place_id
            }
        }
    },

    /**
     * Gets all locations that are to be created from within the Places Search and sets up the base geoJSON and google map objects.
     */
    createPlacesLocations: function () {

        var tags = _loc.tags;
        var geoJSON;
        var locations = [];
        var placesSearchResultsMap = _loc.placesSearchResultsMap;
        var selector = _loc.$$("#colourSelect2");
        _loc.colourProp = selector == null? "" : selector.options[selector.selectedIndex].text;
        _loc.colourProp = _loc.colourProp == "" ? "Black" : _loc.colourProp;
        var selector2 = _loc.$$("#editableSelect2");
        _loc.editableProp = selector2 == null? "" : selector2.options[selector2.selectedIndex].getAttribute("value");
        _loc.editableProp = _loc.editableProp == "" ? true : (_loc.editableProp.toLowerCase() === 'true' || _loc.editableProp === true);
        var checkedElements = document.querySelectorAll('input[name="createPlace"]:checked');
        for(var i = 0; i < checkedElements.length; i++){
            var place_id = checkedElements[i].getAttribute("value");
            var name = placesSearchResultsMap[place_id].name;
            var address = placesSearchResultsMap[place_id].vicinity;
            var lat = placesSearchResultsMap[place_id].geometry.location.lat();
            var lng = placesSearchResultsMap[place_id].geometry.location.lng();
            var type = _loc.$$("input[type=radio][name='" + place_id + "']:checked").getAttribute("value");

            var googlePoint = new google.maps.LatLng(lat, lng);
            var location;
            var shape;
            var properties = _loc.preparePropertiesForPOST(type);
            if (tags && tags.length > 0) {
                var placesTags = [];
                for (var i3 = 0; i3 < tags.length; i3++) {
                    placesTags.push(tags[i3]['name']);
                }
                properties['tags'] = placesTags;
            }
            var radius = _loc.$$(".radiusInput[placeholder='" + place_id + "']").value;
            if (!radius || radius.toString().trim().length === 0) {
                console.log('Please enter a radius for location "' + name + '".');
                locations = [];
                return false;
            }
            radius = Number(radius);
            if (isNaN(radius) || (radius % 1) !== 0 || radius <= 0 || radius > 50000) {
                console.log('Radius for location "' + name + '" is invalid. Please enter an integer greater than 0 and less than 50,000.');
                locations = [];
                return false;
            }

            properties["Address"] = address;
            if (type === 'region') {
                geoJSON = {
                    location: {
                        "type": "Feature",
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                []
                            ]
                        },
                        "properties": properties
                    }
                };
                location = new google.maps.Circle({center: googlePoint, radius: radius});
                shape = "circle";
            }
            else {
                properties["Proximity"] = radius;
                geoJSON = {
                    location: {
                        "type": "Feature",
                        "geometry": {
                            "type": "Point",
                            "coordinates": []
                        },
                        "properties": properties
                    }
                };
                location = new google.maps.Marker({position: googlePoint});
                shape = "point";
            }
            _loc.getCoordinates(location, geoJSON, shape);
            locations.push({"label": name, "location": geoJSON.location});
        }
        if (locations.length > 0) {
            _loc.newPlacesLocationsCount = locations.length;
            _loc.placesSearchResults = [];
            _loc.placesSearchResultsMap = {};
            _loc.allLocationsRadius = 20;
            _loc.arePlacesSearchResults = false;
            _loc.makeLocations(locations, true);
            _loc.togglePlacesSearch();
        }
    },

    /**
     * Returns the geoJSON properties object in preparation for a POST to the location service.
     * @param optionalPlacesType
     * @return {}
     */
    preparePropertiesForPOST: function (optionalPlacesType) {
        var properties = {};
        var isPlacesSearch = _loc.isPlacesSearch;
        var isPOI = _loc.isPOI;
        if (!isPlacesSearch) {
            properties = isPOI ? {} : {googleMaps: _loc.activeLocation.location.properties.googleMaps};
        }
        else {
            properties = optionalPlacesType === 'poi' ? {} : {googleMaps: {'shape': 'circle'}};
        }
        var newProperties = _loc.regionProperties;
        if (newProperties !== null && newProperties.length > 0) {
            for (var i = 0; i < newProperties.length; i++) {
                var propKey = newProperties[i]['key'];
                var propVal = newProperties[i]['val'];
                if (propVal.toString().toLowerCase() === "true") {
                    propVal = true;
                }
                else if (propVal.toString().toLowerCase() === "false") {
                    propVal = false;
                }
                else if (!isNaN(propVal)) {
                    propVal = Number(propVal);
                }
                properties[propKey] = propVal;
            }
        }
        //add editable property
        properties["Editable"] = _loc.editableProp;
        //add colour property
        if ((!isPlacesSearch && !isPOI) || (isPlacesSearch && optionalPlacesType === 'region')) {
            var colour = _loc.colourProp;
            properties["Color"] = colour;
            if (!isPlacesSearch) {
                _loc.activeGoogleLocation.setOptions({"fillColor": colour});
            }
        }
        return properties;
    },

    /**
     * Returns a list of all existing locations and their properties. Used to populate the Location Name and Location Property autocomplete lists.
     * @return {Array}
     */
    allLocationsAndProperties: function () {
        var locationsAndProps = [];
        for (var locationId in allLocations) {
            var geoJSON = allLocations[locationId][1];
            var obj = {};
            obj.id = locationId;
            obj.name = geoJSON.label ? geoJSON.label : geoJSON._id;
            obj.properties = geoJSON.location.properties;
            locationsAndProps.push(obj);
        }

        _loc.locations = locationsAndProps;
        return locationsAndProps;
    },

    /**
     * Returns a list of all existing Regions and their properties. Used to populate the Region Name and Region Property autocomplete lists.
     * @return {Array}
     */
    allRegionsAndProperties: function () {
        var regionsAndProps = [];
        for (var regionId in allRegions) {
            var geoJSON = allRegions[regionId][1];
            var obj = {};
            obj.id = regionId;
            obj.name = geoJSON.label ? geoJSON.label : geoJSON._id;
            obj.properties = geoJSON.location.properties;
            regionsAndProps.push(obj);
        }
        return regionsAndProps;
    },

    /**
     * Returns a list of all existing POIs and their properties. Used to populate the POI Name and POI Property autocomplete lists.
     * @return {Array}
     */
    allPOIsAndProperties: function () {
        var poisAndProps = [];
        for (var poiId in allPOIs) {
            var geoJSON = allPOIs[poiId][1];
            var obj = {};
            obj.id = poiId;
            obj.name = geoJSON.label ? geoJSON.label : geoJSON._id;
            obj.properties = geoJSON.location.properties;
            poisAndProps.push(obj);
        }
        return poisAndProps;
    },

    /**
     * Compares a value against a search query. Function used by the autocomplete and search.
     * @param value - The value that the query will be checked against (eg. location name, location property)
     * @param query - The search query
     * @param exactMatch - Boolean value that when true will force an exact match search (when clicking on an item from the autocomplete)
     * @param forceContains - Boolean value that when true will force the search to be contains (when using a search other than the main bar)
     * @return {boolean}
     */
    compareStrings: function (value, query, exactMatch, forceContains) {
        var searchType = _loc.$$("input[name='searchType']:checked") == null ? _loc.searchType : _loc.$$("input[name='searchType']:checked").value;
        value = value.toString();
        query = query.toString();

        if (query.trim().length === 0) {
            return true;
        }
        if ((searchType === 'exactMatch' || exactMatch) && !forceContains) {
            if (value === query) {
                return true;
            }
        }
        else if (searchType === 'contains' || forceContains) {
            if (value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) !== -1) {
                return true;
            }
        }
        else if (searchType === 'startsWith') {
            if (value.substr(0, query.length).toLocaleLowerCase() === query.toLocaleLowerCase()) {
                return true;
            }
        }
        else if (searchType === 'endsWith') {
            if (value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase(), value.length - query.length) !== -1) {
                return true;
            }
        }
        return false;
    },

    /**
     * Autocomplete search function that returns matches that are to be displayed in the autocomplete list.
     * @param strs
     * @param type
     * @param forceContains
     * @return {Function}
     */
    autoCompleteSearch: function (strs, type, forceContains) {
        return function findMatches(q, cb) {
            var matches = [];
            if (type === 'location' || type === 'monitor') {
                $.each(strs, function (i, str) {
                    if (_loc.compareStrings(str['name'], q, false, forceContains)) {
                        matches.push({value: str['name']});
                    }
                });
            }
            else if (type === 'property') {
                $.each(strs, function (i, str) {
                    var props = str['properties'];
                    for (var propName in props) {
                        if (propName !== 'googleMaps') { //don't include googleMaps object
                            if (_loc.compareStrings(propName, q, false, forceContains)) {
                                matches.push({location: str['name'], propName: propName.toString(), propValue: props[propName].toString(), value: propName.toString()});
                            }
                            else if (_loc.compareStrings(props[propName], q, false, forceContains)) {
                                matches.push({location: str['name'], propName: propName.toString(), propValue: props[propName].toString(), value: props[propName].toString()});
                            }
                        }
                    }
                });
            }
            cb(matches);
        };
    },

    /**
     * This function is tied to the import location function of the editor. It's purpose is to wait until all input files have been read before importing
     * the location data. Once the data has been read it will be passed in as an array of locations to the makeLocations function.
     */
    locationImportCountChanged: function () {
        var locationImportCount = _loc.locationImportCount;
        var importedLocationData = _loc.importedLocationData;
        if (locationImportCount === 0 && importedLocationData) {
            _loc.makeLocations(importedLocationData, true);
        }
    },

    /**
     * Show the necessary inputs if searchBy is changed and close the Search Options dialog.
     */
    changeSearchBy: function () {
        if (_loc.searchByType == "nameVal")
            _loc.searchBy = _loc.searchByNameVal;
        else if (_loc.searchByType == "propVal")
            _loc.searchBy = _loc.searchByPropVal;
        else if (_loc.searchByType == "map")
            _loc.searchBy = "map";
        if(setup)
            _loc.updateMainAutoComplete();
        _loc.showSearchDialog = false;
    },

    changeSearchByType: function () {

        _loc.searchByType = _loc.$$("input[name='searchByType']:checked").value;
        _loc.changeSearchBy();
    },

    /**
     * Close the Search Options dialog after the searchType is changed.
     */
    changeSearchType: function () {
        _loc.searchType = _loc.$$("input[name='searchType']:checked").value;
        switch(_loc.searchType){
            case "endsWith":
                _loc.autoComplete.filter = _loc.FILTER_ENDS;
                break;
            case "startsWith":
                _loc.autoComplete.filter = _loc.FILTER_STARTSWITH;
                break;
            case "contains":
                _loc.autoComplete.filter = _loc.FILTER_CONTAINS;
                break;
            case "exactMatch":
                _loc.autoComplete.filter = _loc.FILTER_EXACT;
                break;
        }
        _loc.toggleSearchOptDialog();
    },

    FILTER_STARTSWITH : function (text, input) {
        return RegExp("^" + input.trim().replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(text);
    },
    FILTER_CONTAINS : function (text, input) {
        return RegExp(input.trim().replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(text);
    },
    FILTER_ENDS : function (text, input) {
        return RegExp(input.trim().replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&") + "$", "i").test(text);
    },
    FILTER_EXACT : function (text, input) {
        return input.trim()===text;
    },
    /**
     * Toggles disabled on the Change Threshold input depending on if the relevant event is selected.
     */
    movesInRegionChanged: function () {
        if (_loc.movesInRegion) {
            _loc.locationChangeLimitDisabled = false;
        }
        else {
            _loc.locationChangeLimitDisabled = true;
        }
    },

    /**
     * Toggles disabled on the Near POI Threshold input depending on if the relevant event is selected.
     */
    nearRegionPoiChanged: function () {
        if (_loc.nearRegionPoi) {
            _loc.locationNearLimitDisabled = false;
        }
        else {
            _loc.locationNearLimitDisabled = true;
        }
    },

    /**
     * Toggles disabled on the radius input in the Places Search.
     */
    placesSearchRankChanged: function () {
        var placesSearchRank = _loc.placesSearchRank;
        if (placesSearchRank === 'DISTANCE') {
            _loc.placesRadiusDisabled = true;
        }
        else {
            _loc.placesRadiusDisabled = false;
        }
    },

    /**
     * Update all radius inputs with the master input at the top of the Places Search Results table.
     */
    allLocationsRadiusChanged: function () {

        var pos = _loc.$$("#placesBody") == null ? null : _loc.$$("#placesBody").querySelectorAll(".radiusInput[name='radiusInput']");
        if (pos != null) {
            console.log(pos);
            for (var i = 0; i < pos.length; i++) {
                var node = pos[i];
                node.setAttribute("value",_loc.allLocationsRadius.toString());
            }
        }


    },

    /**
     * Setup Places Search Result listeners used for toggling different input states depending on the selected values.
     */
    placesSearchResultsChanged: function () {
        if (_loc.placesSearchResults && _loc.placesSearchResults.length > 0) {
            _loc.arePlacesSearchResults = true;
            setTimeout(function () {
                var place_id;
                //toggle all create checkboxes
                var event = document.createEvent('HTMLEvents');
                event.initEvent('change', true, false);
                var toggleBoxes = function () {
                    var checked = this.checked;
                     var boxes = _loc.$$("#placesBody").querySelectorAll("input[name='createPlace']");
                    for (var i = 0; i < boxes.length; i++) {
                        boxes[i].checked=checked;
                        boxes[i].dispatchEvent(event);
                    }
                };
                _loc.$$("input[name='createAllPlaces']").removeEventListener("change", toggleBoxes);
                _loc.$$("input[name='createAllPlaces']").addEventListener("change", toggleBoxes);


                var toggleType = function () {
                    var buttons;
                    if (this.value === 'allRegion') {
                        buttons = _loc.$$("#placesBody").querySelectorAll("input[data='placesType'][value='region']");
                    }
                    else {
                        buttons = _loc.$$("#placesBody").querySelectorAll("input[data='placesType'][value='poi']");
                    }
                    for(var i=0;i<buttons.length;i++){
                        buttons[i].checked = true;
                        buttons[i].dispatchEvent(event);
                    }
                };
                //toggle all location types
                _loc.$$("input[name='allLocations'][value='allRegion']").removeEventListener("change", toggleType);
                _loc.$$("input[name='allLocations'][value='allRegion']").addEventListener("change", toggleType);
                _loc.$$("input[name='allLocations'][value='allPois']").removeEventListener("change", toggleType);
                _loc.$$("input[name='allLocations'][value='allPois']").addEventListener("change", toggleType);


                var individualCheck = function(){
                    var thisCheckbox = this;
                    //setTimeout(function () {
                        place_id = thisCheckbox.getAttribute("value");
                        var buttons = _loc.$$("#placesBody").querySelectorAll("input[type='radio'][name='" + place_id + "']");
                        if (thisCheckbox.checked) {
                            buttons[0].removeAttribute('disabled');
                            buttons[1].removeAttribute('disabled');
                            _loc.$$("input[type='text'][placeholder='" + place_id + "']").removeAttribute('disabled');
                        }
                        else {
                            buttons[0].setAttribute('disabled', 'disabled');
                            buttons[1].setAttribute('disabled', 'disabled');
                            _loc.$$("input[type=text][placeholder='" + place_id + "']").setAttribute('disabled', 'disabled'); //disable radius input
                        }

                    //}, 0);
                };
                //change listener for individual 'create' checkboxes, used to toggle disabled on the places type radios
                var checkboxes = _loc.$$("#placesBody").querySelectorAll("input[name='createPlace']");
                    for(var i = 0; i < checkboxes.length; i++) {
                        checkboxes[i].removeEventListener("change",individualCheck);
                        checkboxes[i].addEventListener("change",individualCheck);
                    }

                //change all Radius inputs

            }, 0);
        }
    },
    /**
     * Toggle the visibility of the import locations dialog.
     */
    toggleImportDialog: function () {
        _loc.showImportDialog = !_loc.showImportDialog;
    },

    /**
     * Function used for importing locations. Only accepts json or geojson file extensions and the new locations will be named sequentially based on the filename they were imported from.
     */
    importLocations: function () {
        if (window.File && window.FileReader && window.FileList && window.Blob) {
            var files = document.getElementById('geoJSONUploads').files;
            if (!files || files.length === 0) {
                console.log('Please select a geojson file to import.');
                return;
            }
            var file;
            var fileExt;
            var reader;
            var importedLocationData = [];
            _loc.locationImportCount = files.length;
            for (var i = 0; i < files.length; i++) {
                reader = new FileReader();
                file = files[i];
                if (file) {
                    fileExt = file.name.split(".")[1].toLowerCase();
                    if (fileExt !== 'json' && fileExt !== 'geojson') {
                        console.log("File is not in the correct format (must be .json or .geojson)");
                        _loc.locationImportCount = _loc.locationImportCount - 1;
                        continue;
                    }
                }
                else {
                    console.log("Failed to load file");
                    _loc.locationImportCount = _loc.locationImportCount - 1;
                    continue;
                }
                reader.onload = (function (theFile) {
                    var fileName = theFile.name.split(".")[0];
                    return function (e) {
                        var importedJSON = JSON.parse(e.target.result);
                        var type = importedJSON.type.toLowerCase();
                        if (type === "feature") {
                            if (importedJSON.geometry.type.toLowerCase() === "polygon" || importedJSON.geometry.type.toLowerCase() === "point") {
                                importedLocationData.push({"label": fileName, "location": importedJSON});
                                _loc.importedLocationData = importedLocationData;
                                _loc.locationImportCount = _loc.locationImportCount - 1;
                            }
                            else {
                                console.log("Invalid geoJSON: Type of geometry object must be polygon or point");
                            }
                        }
                        else if (type === "featurecollection") {
                            var features = importedJSON.features;
                            for (var i = 0; i < features.length; i++) {
                                if (features[i].geometry.type.toLowerCase() === "polygon" || features[i].geometry.type.toLowerCase() === "point") {
                                    importedLocationData.push({"label": fileName + i, "location": features[i]});
                                }
                                else {
                                    console.log("Invalid geoJSON: Type of geometry object must be polygon or point");
                                }
                            }
                            _loc.importedLocationData = importedLocationData;
                            _loc.locationImportCount = _loc.locationImportCount - 1;
                        }
                        else {
                            console.log("Invalid geoJSON: Type of geoJSON object must be feature or feature collection");
                        }
                    };
                })(file); //jshint ignore:line
                reader.readAsText(file);
            }
        }
        else {
            alert('The File APIs are not fully supported by this browser.');
        }
        _loc.toggleImportDialog();
    },

    /**
     * DELETEs a Region from the database.
     * @param location
     * @param geoJSON
     */
    deleteRegion: function (location, geoJSON) {
        bridgeit.io.location.deleteRegion({
            realm: _loc.realm,
            id: geoJSON._id
        }).then(function(){
            _loc.deleteLocationSuccess(location, geoJSON, 'region');
        }).catch(function(error){
            _loc.deleteLocationFail();
        });
    },

    /**
     * DELETEs a POI from the database.
     * @param location
     * @param geoJSON
     */
    deletePOI: function (location, geoJSON) {
        bridgeit.io.location.deletePOI({
            realm:_loc.realm,
            id: geoJSON._id
        }).then(function () {
            _loc.deleteLocationSuccess(location, geoJSON, 'poi');
        }).catch(function (error) {
            console.log('deletePOI failed ' + error);
            _loc.deleteLocationFail();
        });
    },

    /**
     * Success callback for Region and POI DELETEs.
     * @param location
     * @param geoJSON
     * @param type
     */
    deleteLocationSuccess: function (location, geoJSON, type) {
        var currentId = geoJSON._id;

        if (type === "region") {
            delete allRegions[currentId];
            delete allLocations[currentId];
            _loc.isPOI = false;

        }
        else {
            delete allPOIs[currentId];
            delete allLocations[currentId];
            _loc.isPOI = true;
        }

        if (_loc.isMassDelete) {
            var deletedCount = _loc.deletedCount;
            deletedCount++;
            _loc.deletedCount = deletedCount;
            if (_loc.toDeleteCount === deletedCount) { //all locations have been deleted
                _loc.allLocationsDeleted();
            }
        }
        else {
            _loc.updateMainAutoComplete();
        }
        location.setMap(null);
    },

    /**
     * Fail callback for Region and POI DELETEs.
     */
    deleteLocationFail: function () {
        if (_loc.isMassDelete) {
            var deletedCount = _loc.deletedCount;
            deletedCount++;
            _loc.deletedCount = deletedCount;
            if (_loc.toDeleteCount === deletedCount) { //all locations have been deleted
                _loc.allLocationsDeleted();
            }
        }
        console.log("error in deleting location from database");
    },

    /**
     * Generates locations on the map and sets up required listeners. If doPOST is true (importing from file or places search creation) then the locations will be created on the map and then POSTed to the DB.
     * @param data
     * @param doPOST
     */
    makeLocations: function (data, doPOST) {
        var bounds = new google.maps.LatLngBounds();
        for (var record = 0; record < data.length; record++) {
            try {
                var type = data[record].location.geometry.type.toLowerCase();
                var coords = data[record].location.geometry.coordinates;
                var properties = typeof data[record].location.properties === "undefined" ? {} : data[record].location.properties;
                var editable = typeof properties["Editable"] === "undefined" ? true : (properties["Editable"] === 'true' || properties["Editable"] === 'True' || properties["Editable"] === true);
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
                            bounds.extend(googlePoint);
                        }
                        paths.push(path);
                    }
                    if (metadata.shape === "polygon" || typeof metadata.shape === "undefined") {
                        metadata.shape = "polygon";
                        region = new google.maps.Polygon({
                            'paths': paths,
                            'map': _loc._map,
                            'editable': editable,
                            'fillColor': color
                        });
                    }
                    else if (metadata.shape === "circle") {
                        region = new google.maps.Circle({
                            'center': new google.maps.LatLng(metadata.center[0], metadata.center[1]),
                            'radius': metadata.radius,
                            'map': _loc._map,
                            'editable': editable,
                            'fillColor': color
                        });

                    }
                    else if (metadata.shape === "rectangle") {
                        region = new google.maps.Rectangle({
                            'bounds': new google.maps.LatLngBounds(new google.maps.LatLng(coords[0][0][1],
                                    coords[0][0][0]), new google.maps.LatLng(coords[0][2][1],
                                    coords[0][2][0])
                            ),
                            'map': _loc._map,
                            'editable': editable,
                            'fillColor': color
                        });
                    }
                    geoJSON = data[record];
                    properties["googleMaps"] = metadata;
                    geoJSON.location.properties = properties;
                    if (!doPOST) {
                        if (!geoJSON.label) {
                            geoJSON.label = geoJSON._id;
                        }
                        allRegions[geoJSON._id] = [region, geoJSON];
                        allLocations[geoJSON._id] = [region, geoJSON];
                        _loc.setupListeners(region, geoJSON, metadata.shape);
                    }
                    else {
                        _loc.postRegion(region, geoJSON, metadata.shape, false);
                    }
                }
                else if (type === "point") { //poi
                    googlePoint = new google.maps.LatLng(coords[1], coords[0]);
                    var poi;
                    poi = new google.maps.Marker({
                        position: googlePoint,
                        map: _loc._map,
                        draggable: editable
                    });
                    bounds.extend(googlePoint);
                    geoJSON = data[record];
                    if (!doPOST) {
                        if (!geoJSON.label) {
                            geoJSON.label = geoJSON._id;
                        }
                        allPOIs[geoJSON._id] = [poi, geoJSON];
                        allLocations[geoJSON._id] = [poi, geoJSON];
                        _loc.setupListeners(poi, geoJSON, "point");
                    }
                    else {
                        _loc.postPOI(poi, geoJSON, "point", false);
                    }
                }
            }
            catch (err) {
                console.log("Issue importing region or poi: " + JSON.stringify(data[record]), err);
            }
        }
        //set the map to the right zoom level for the regions
        _loc._map.fitBounds(bounds);
        _loc._map.panToBounds(bounds);
    }



});

