Polymer({
    is: 'voyent-alert-template-editor',

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
         * The height of the google map to be created, as an integer. If left empty we will default to the height
         * of the parent container. If a height cannot be found then a default minimum of 300 will be used.
         */
        height: Number,
        /**
         * The width of the google map to be created, as an integer. If left empty we will default to the width of the
         * parent container.
         */
        width: Number,
        /**
         * Enable a percent of the full page height to automatically fill with the map. To disable use a value of -1.
         * Height = "h*autoheight" so 0.8 corresponds to 80% of the page height. 1.2 would be 120%, etc.
         */
        autoheight: { type: Number, value: -1, notify: true }
    },

    /**
     * Fired after the Google Map has been initialized. Contains the map object.
     * @event mapInitialized
     */

    observers: [
        '_featuresChanged(_trackerData.tracker.zones.features.length)'
    ],

    ready: function() {
        var _this = this;
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }

        //initialize google maps
        window.initializeLocationsMap = function () {
            _this._map = new google.maps.Map(_this.$.map, {
                zoom: 10,
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
            //fire event indicating the map is loaded
            _this.fire('mapInitialized', {map: _this._map});
            //calculate the map size
            _this._calcMapSize();
             //setup ui and listeners for manually adding new location markers
            _this._drawingManager = new google.maps.drawing.DrawingManager({
                map:_this._map,
                drawingControlOptions: {
                    position: google.maps.ControlPosition.TOP_RIGHT ,
                    drawingModes: ['marker']
                },
                markerOptions: {draggable:true, 'zIndex':50}
            });
            _this._setupDrawingListeners();
            //make sure the map is sized correctly when the window size changes
            google.maps.event.addListener(window, 'resize', function () {
                _this.resizeMap();
            });

            //initialize some vars
            _this._editing = _this._addingNew = false;
            _this._readOnlyProperties = ['Editable','Color','Opacity'];
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
     * Trigger the Google Map resize event and recalculate the map size.
     */
    resizeMap: function() {
        if (('google' in window) && this._map) {
            this._calcMapSize();
            google.maps.event.trigger(this._map, 'resize');
        }
    },

    /**
     * Initialize the listeners that handle drawing a new alert template on the map.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        var shape;

        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            shape = oce.overlay;

            if (oce.type === 'marker') { //marker is actually a circle tracker
                //create the new google maps circle
                var newCircle = new google.maps.Circle(_this._getCircleProperties());
                //bind the circle to the marker
                newCircle.bindTo('center', oce.overlay, 'position');
                //build the geoJSON structure for the tracker template
                var tracker = _this._getTrackerJSON();
                tracker.anchor.geometry.coordinates = [shape.getPosition().lng(),shape.getPosition().lat()];
                //build our object for holding the various pieces
                _this._trackerData = {"tracker":tracker,"marker":shape,"circles":[newCircle]};
                //determine and set the coordinates for the circle
                _this._setCoordinates();
                //save the tracker in the location service
                _this._saveTracker();
            }

            //go back to regular (no drawing) mode
            _this._drawingManager.setDrawingMode(null);
        });

        //if the escape key is pressed then stop drawing
        //and cancel any polygons currently being drawn
        window.addEventListener('keydown',function (event) {
            if (event.which === 27) {
                if (_this._drawingManager.getDrawingMode() !== null) {
                    _this._drawingManager.setDrawingMode(null);
                    if (shape) {
                        shape.setMap(null);
                        shape = null;
                    }
                }
            }
        });
    },

    /**
     * Adds necessary google map listeners for markers and circles.
     * @private
     */
    _setupChangeListeners: function() {
        var _this = this;
        if (this._trackerData.marker) {
            //clear any previously added listeners (we'll call this function again for newly added zones)
            google.maps.event.clearInstanceListeners(this._trackerData.marker);
            //add drag listener to marker
            google.maps.event.addListener(this._trackerData.marker, 'dragend', function (event) {
                _this._trackerEdited(_this._trackerData);
            });
        }
        if (this._trackerData.circles) {
            for (var i = 0; i < this._trackerData.circles.length; i++) {
                //clear any previously added listeners (we'll call this function again for newly added zones)
                google.maps.event.clearInstanceListeners(this._trackerData.circles[i]);
                //add resize listener to circles
                google.maps.event.addListener(this._trackerData.circles[i], 'radius_changed', function (event) {
                    _this._trackerEdited(_this._trackerData);
                });
                //add click listener to circles
                (function(i) {
                    google.maps.event.addListener(_this._trackerData.circles[i], 'click', function (event) {
                        _this._toggleAccordion(i);

                    });
                }(i))
            }
        }
    },

    /**
     * Keeps the tracker JSON in sync whenever a change is made on the map.
     * @private
     */
    _trackerEdited: function() {
        //update the tracker coordinates
        this._setCoordinates();
        //save the tracker
        this._saveTracker()
    },

    /**
     * Toggles the accordion panels. We use this function to toggle the
     * accordion for both accordion pane and proximity zone clicks.
     * @param eOrI
     * @private
     */
    _toggleAccordion: function(eOrI) {
        //this function will either be passed an event (from the ui) or a direct index (from the JS)
        var index = eOrI.target ? eOrI.model.get('index') : eOrI;
        var _this = this;
        for (var i=0; i<this._trackerData.tracker.zones.features.length; i++) {
            if (i === index) {
                //show this accordion
                _this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.visible',true);
                //indicate which zone is selected
                _this._trackerData.circles[i].setOptions({"strokeWeight":3});
            }
            else {
                //hide the rest
                _this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.visible',false);
                //indicate these zone are de-selected
                _this._trackerData.circles[i].setOptions({"strokeWeight":0});
            }
        }
    },

    /**
     * Syncs the tracker JSON with the current state of the map entities.
     * @private
     */
    _setCoordinates: function () {
        //Copy the marker coordinates to the tracker in case a tracker position has moved.
        this._trackerData.tracker.anchor.geometry.coordinates = [this._trackerData.marker.getPosition().lng(),this._trackerData.marker.getPosition().lat()];
        var features = this._trackerData.tracker.zones.features;
        var N = 50; //The number of coordinates the circle approximation will have.
        var degreeStep = 360 / N; //The number of degrees in which each coordinate will be spaced apart.
        for (var i=0; i<features.length; i++) {
            //Sync the tracker zone properties with the zone drawn on the map.
            features[i].properties.googleMaps.radius = this._trackerData.circles[i].getRadius();
            features[i].properties.googleMaps.center = [this._trackerData.circles[i].getCenter().lat(),this._trackerData.circles[i].getCenter().lng()];
            features[i].properties.Color = this._trackerData.circles[i].get('fillColor').substring(1);
            features[i].properties.googleMaps.zIndex = this._trackerData.circles[i].get('zIndex');
            //Reset the coordinates since we'll recalculate them below.
            features[i].geometry.coordinates = [[]];

            for (var j=0; j<N; j++) {
                //Calculate the next coordinate...
                var latLng = google.maps.geometry.spherical.computeOffset(this._trackerData.circles[i].getCenter(),
                                                                          this._trackerData.circles[i].getRadius(),
                                                                          degreeStep * j);
                //...and save it.
                features[i].geometry.coordinates[0].push([latLng.lng(), latLng.lat()]);
            }
            //In addition to N coordinates we also need to push the first one as the last one so that the circle is connected.
            features[i].geometry.coordinates[0].push(features[i].geometry.coordinates[0][0]);
        }
    },

    /**
     * Saves a tracker to the database via a POST or PUT.
     * @private
     */
    _saveTracker: function () {
        var _this = this;
        var func = !this._trackerData.tracker._id ? 'createTracker' : 'updateTracker';
        //Clone the object and remove the tmpProperties we use in the template.
        var tracker = JSON.parse(JSON.stringify(this._trackerData.tracker));
        delete tracker.tmpProperties;
        for (var i=0; i<tracker.zones.features.length; i++) {
            delete tracker.zones.features[i].tmpProperties;
        }
        voyent.io.locate[func]({
            realm: this.realm,
            account: this.account,
            tracker: tracker,
            id: tracker._id //not necessary if 'create' but no harm in passing it anyway
        }).then(function (uri) {
            if (func === 'createTracker') {
                //grab the generated ID from the return URI
                _this.set('_trackerData.tracker._id',uri ? uri.split('/').pop() : _this._trackerData.tracker._id);
                //setup change listeners
                _this._setupChangeListeners(_this._trackerData);
                _this.fire('message-info', 'Alert Template successfully created.');
            }
            else {
                _this.fire('message-info', 'Alert Template successfully updated.');
            }
        }).catch(function (error) {
            if (func === 'createTracker') {
                _this._trackerData.marker.setMap(null);
                for (var i = 0; i < _this._trackerData.circles.length; i++){
                    _this._trackerData.circles[i].setMap(null);
                }
            }
            _this.fire('message-error', 'Issue saving Alert Template ' + error);
            console.error('Issue saving Alert Template',error);
        });
    },

    /**
     * Adds a new proximity zone to an existing alert template. The new zone is 50% larger than the largest existing zone.
     * @private
     */
    _addProximityZone: function() {
        var smallestIndex = 50, largestRadius = 0;
        //get the size of largest circle and our smallest zIndex so we can determine what values to set for the new one
        for (var i=0; i<this._trackerData.circles.length; i++) {
            if (this._trackerData.tracker.zones.features[i].properties.googleMaps.radius >= largestRadius) {
                largestRadius = this._trackerData.tracker.zones.features[i].properties.googleMaps.radius;
            }
            if (this._trackerData.tracker.zones.features[i].properties.googleMaps.zIndex <= smallestIndex){
                smallestIndex = this._trackerData.tracker.zones.features[i].properties.googleMaps.zIndex;
            }
        }
        //set the new zone radius as 50% larger than the current largest zone
        largestRadius = largestRadius + largestRadius * 0.5;
        //set the new zone zIndex lower so it sits behind the other zones
        smallestIndex = smallestIndex - 1;

        //build the properties for the new circle
        var props = this._getCircleProperties();
        props.radius = largestRadius;
        props.zIndex = smallestIndex;
        //create the google maps circle
        var newCircle = new google.maps.Circle(props);
        //bind the circle to the marker
        newCircle.bindTo('center', this._trackerData.marker, 'position');

        //build the geoJSON structure for the proximity zone
        var newCircleJSON = this._getZoneJSON();
        newCircleJSON.properties.zoneId = this._trackerData.tracker.zones.features.length + 1;
        //add the new zone to the tracker template
        this.push('_trackerData.tracker.zones.features',newCircleJSON);
        //add the new circle to our saved list
        this.push('_trackerData.circles',newCircle);

        //add the change listeners to the new circle
        this._setupChangeListeners();
        //add coordinates for the new circle
        this._setCoordinates();
        //save the tracker data with the new proximity zone added
        this._saveTracker();
    },

    /**
     * Removes a proximity zone from an existing alert template.
     * @private
     */
    _removeProximityZone: function(e) {
        //get the index of the proximity zone that is to be removed
        var i = parseInt(e.target.getAttribute('data-index'));
        //remove the zone from the tracker JSON
        this.splice('_trackerData.tracker.zones.features',i,1);
        //remove the circle from the map
        this._trackerData.circles[i].setMap(null);
        //remove the reference to the circle
        this.splice('_trackerData.circles',i,1);
        this._saveTracker();
    },

    _toggleProximityZoneRenaming: function(eOrI) {
        //this function will either be passed an event (from the ui) or a direct index (from the JS)
        var i = eOrI.target ? eOrI.target.getAttribute('data-index') : eOrI;
        //get the new state of the remaining var
        var renaming = !this.get('_trackerData.tracker.zones.features.'+i+'.tmpProperties.renaming');
        if (renaming) {
            //set the input value to the current zoneId
            this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName',this.get('_trackerData.tracker.zones.features.'+i+'.properties.zoneId'));
        }
        //set renaming to the new value
        this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.renaming',renaming);
    },

    _renameProximityZone: function(e) {
        //get the index of the proximity zone being renamed
        var i = e.target.getAttribute('data-index');
        //get the new name
        var newName = this.get('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName');
        //set the new name as the zoneId
        this.set('_trackerData.tracker.zones.features.'+i+'.properties.zoneId',newName);
        //reset the newName var
        this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName','');
        //toggle the input
        this._toggleProximityZoneRenaming(i);
        //and finally save the tracker
        this._saveTracker();
    },

    _toggleTrackerRenaming: function() {
        //get the new state of the remaining var
        var renaming = !this.get('_trackerData.tracker.tmpProperties.renaming');
        if (renaming) {
            //set the input value to the current zoneId
            this.set('_trackerData.tracker.tmpProperties.newName',this.get('_trackerData.tracker.label'));
        }
        //set renaming to the new value
        this.set('_trackerData.tracker.tmpProperties.renaming',renaming);
    },

    _renameTracker: function() {
        //get the new name
        var newName = this.get('_trackerData.tracker.tmpProperties.newName');
        //set the new name as the zoneId
        this.set('_trackerData.tracker.label',newName);
        //reset the newName var
        this.set('_trackerData.tracker.tmpProperties.newName','');
        //toggle the input
        this._toggleTrackerRenaming();
        //and finally save the tracker
        this._saveTracker();
    },

    /**
     * Monitors the length of the zones array.
     * @param length
     * @private
     */
    _featuresChanged: function(length) {
        this.set('_hasOneZone',length === 1);
    },

    /**
     * Determine the map size to use. This will leverage this.height and this.width if available. Otherwise the parent
     * container size will be used. If this.autoheight is specified than it will override this.height.
     */
    _calcMapSize: function() {
        return; //TODO - Needs some work to work with the new properties panel
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
                height = this.$$('#container').clientHeight;
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
            this.$$('#map').style.width = this.width + 'px';
        }
        else {
            this.$$('#map').style.width = '100%';
        }
    },

    /**
     * Returns the default JSON structure of a tracker template.
     * @returns {{anchor: {type: string, geometry: {type: string, coordinates: Array}, properties: {Editable: string}}, zones: {type: string, features: [*]}}}
     * @private
     */
    _getTrackerJSON: function() {
        return {
            "anchor": {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": []
                },
                "properties": {
                    "Editable": true,
                    "zIndex":50
                }
            },
            "zones": {
                "type": "FeatureCollection",
                "features": [
                    this._getZoneJSON()
                ]
            },
            "label":"Unnamed",
            //These properties are used by the view and will be removed before saving the tracker.
            "tmpProperties": {
                "renaming":false,
                "newName":''
            }
        }
    },

    /**
     * Returns the default JSON structure of a proximity zone.
     * @returns {{type: string, geometry: {type: string, coordinates: [*]}, properties: {googleMaps: {shape: string, radius: number, zIndex: number}, Editable: string, Color: string}}}
     * @private
     */
    _getZoneJSON: function() {
        return {
            "type": "Feature",
            "geometry": {
                "type": "Polygon",
                "coordinates": [[]]
            },
            "properties": {
                "googleMaps": {
                    "shape": "circle",
                    "center": [],
                    "radius": 500,
                    "zIndex": 49
                },
                "Editable": true,
                "Color": "000000",
                "zoneId": 1,
                "Opacity": 0.30
            },
            //These properties are used by the view and will be removed before saving the tracker.
            "tmpProperties": {
                "renaming": false,
                "newName":'',
                "visible":false
            }
        };
    },

    /**
     * Returns the default properties for building a google maps circle.
     * @returns {{editable: boolean, draggable: boolean, radius: number, fillColor: string, strokeWeight: number, zIndex: number, map: (*|google.maps.Map|null)}}
     * @private
     */
    _getCircleProperties: function() {
        return {
            editable: true, draggable: false,
            radius: 500, fillColor: '#000000',
            fillOpacity: 0.30,
            strokeWeight:0, zIndex: 49,
            map: this._map
        };
    },

    /**
     * Template helper for converting properties object into an array.
     * @param obj
     * @returns {Array}
     * @private
     */
    _toArray: function(obj) {
        var array = [];
        for (var key in obj) {
            if (!obj.hasOwnProperty(key)) {
                continue;
            }
            if (key !== 'googleMaps' &&
                key !== 'zoneId') {
                array.push({"key":key,"value":obj[key]});
            }
        }
        return array;
    },

    /**
     * Set the template list sort to be by username
     */
    _sortListProperty: function(e) {
        this._sortType = 'key';
        this._sortDirectionAsc = !this._sortDirectionAsc;
        this.querySelector('#propertyRepeat-'+e.model.get('index')).render(); // force a re-sort
        this._maintainSelectionAfterSort();
    },

    /**
     * Set the template list sort to be by type
     */
    _sortListValue: function(e) {
        this._sortType = 'value';
        this._sortDirectionAsc = !this._sortDirectionAsc;
        this.querySelector('#propertyRepeat-'+e.model.get('index')).render(); // force a re-sort
        this._maintainSelectionAfterSort();
    },

    /**
     * If we have a selection when sorting and that row changes positions then the selected
     * row will still be the row's previous position so we'll re-set the selection.
     * @private
     */
    _maintainSelectionAfterSort: function() {
        var _this = this;
        var selected = this._selected;
        this._selected = null;
        setTimeout(function() {
            _this._selected = selected;
        },0);
    },

    /**
     * Template repeat sort binding
     * This will leverage _sortType and _sortDirectionAsc
     */
    _sortList: function(a, b) {
        if (!this._sortType) {
            this._sortType = 'key';
        }
        if (this._sortDirectionAsc) {
            return a[this._sortType].toString().localeCompare(b[this._sortType]);
        }
        else {
            return b[this._sortType].toString().localeCompare(a[this._sortType]);
        }
    },

    /**
     * Toggles adding a new property view.
     * @param e
     * @private
     */
    _toggleAddingNew: function(e) {
        this._addingNew = !this._addingNew;
    },

    /**
     * Saves a new custom property.
     * @param e
     * @private
     */
    _saveNewProperty: function(e) {
        if (this._customPropKey && this._customPropVal) {
            //get the index of the zone
            var index = e.model.get('index');
            //clone properties and re-set it so the computed binding _toArray updates
            var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
            properties[this._customPropKey] = this._customPropVal;
            this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
            //reset the variables
            this._customPropKey = this._customPropVal = null;
            //toggle the inputs
            this._toggleAddingNew();
            this._saveTracker();
        }
    },

    /**
     * Removes the selected property. Only applicable to custom properties.
     * @param e
     * @private
     */
    _removeSelectedProperty: function(e) {
        //get the index of the zone
        var index = parseInt(e.target.getAttribute('data-index'));
        //clone properties and re-set it so the computed binding _toArray updates
        var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
        delete properties[this._selected];
        this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
        this._saveTracker();
    },

    /**
     * Toggles editing mode in the template.
     * @param e - The event form the template or null if this was toggled after a successful save.
     * @private
     */
    _toggleEditing: function(e) {
        var _this = this;
        this._editing = !this._editing;
        var index = e ? e.model.get('index') : null;
        if (this._editing) { //We are entering edit mode
            var properties = this._trackerData.tracker.zones.features[index].properties;
            switch (this._selected) {
                case 'Editable':
                    //Convert boolean to string for UI
                    this.set('_editableVal',properties['Editable'] ? 'true' : 'false');
                    break;
                case 'Color':
                    this.set('_colorVal',properties['Color']);
                    //Also call the jscolor API so we are sure the input style updates properly
                    function waitForJSColor() {
                        var colorPicker = _this.querySelector('#jsColor-'+index);
                        //Wait till we have a reference to the colour picker
                        if (!colorPicker || !colorPicker.jscolor) {
                            setTimeout(function(){waitForJSColor();},10);
                            return;
                        }
                        _this.querySelector('#jsColor-'+index).jscolor.fromString(_this.get('_colorVal'));
                    }
                    waitForJSColor();
                    break;
                case 'Opacity':
                    this.set('_opacityVal',properties['Opacity']);
                    break;
                default:
                    this._customPropKey = this._selected;
                    this._customPropVal = properties[this._customPropKey];
            }

            //Setup jscolor picker
            setTimeout(function() {
                jscolor.installByClassName("jscolor");
            },0);
        }
        else { //We are exiting editing mode
            if (e !== null) { /*edit cancelled*/ }
            else { /*edit successful*/ }
            //Reset the variables
            this._editableVal = this._colorVal = this._opacityVal = this._customPropKey = this._customPropVal = null;
        }
    },

    /**
     * Handles saving property edits.
     * @param e
     * @private
     */
    _saveEditing: function(e) {
        var _this = this;
        //get the index of the zone
        var index = e.model.get('index');
        //clone properties and re-set it later so the computed binding _toArray updates
        var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
        switch (this._selected) {
            case 'Editable':
                //Set the Editable property. We don't bind directly in case we need to revert.
                properties['Editable'] = this._editableVal.toLowerCase() === 'true'; //Convert string from UI to boolean
                //Set the Editable state on the circle.
                this._trackerData.circles[index].setEditable(properties.Editable);
                this.set('_editableVal',null);
                break;
            case 'Color':
                //Set the Color property. We don't bind directly in case we need to revert.
                properties['Color'] = this._colorVal;
                //Set the Color on the circle.
                this._trackerData.circles[index].setOptions({"fillColor":'#'+properties.Color});
                this.set('_colorVal',null);
                break;
            case 'Opacity':
                //Set the Opacity property. We don't bind directly in case we need to revert.
                properties['Opacity'] = this._opacityVal;
                //Set the Opacity on the circle.
                this._trackerData.circles[index].setOptions({"fillOpacity":properties.Opacity});
                this.set('_opacityVal',null);
                break;
            default:
               properties[this._customPropKey] = this._customPropVal;
                //if the selected key changed...
               if (this._selected !== this._customPropKey) {
                   //...then delete the old one
                   delete properties[this._selected];
                   setTimeout(function() {
                    //...and update the selection
                    _this._selected = _this._customPropKey;
                    //reset the variables
                    _this._customPropKey = _this._customPropVal = null;
                   },0);
               }
        }
        //update the computed binding
        this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
        //toggle editing mode
        this._toggleEditing(null);
        this._saveTracker();
    },

    /**
     * Triggered each time a property row is selected.
     * @param e
     * @param detail
     * @private
     */
    _onIronActivate: function(e,detail) {
        if (detail.selected === this._selected) {
            this._deselectTable(e.model.get('index'));
            e.preventDefault();
        }
    },

    /**
     * Template helper for that returns if the selected property matches the passed one.
     * @param key
     * @param selected
     * @returns {boolean}
     * @private
     */
    _selectedEquals: function(key,selected) {
        if (key !== 'Other') {
            return key === selected;
        }
        else {
            return this._readOnlyProperties.indexOf(selected) === -1;
        }
    },

    /**
     * Handles de-selection in the property table.
     * @param i
     * @private
     */
    _deselectTable: function(i) {
        this.querySelector('#propertySelector-'+i).selected = null;
    },

    /**
     * Determines if the passed property can be removed.
     * @param selected
     * @returns {boolean}
     * @private
     */
    _isRemoveableProperty: function(selected) {
        return selected !== null && this._readOnlyProperties.indexOf(selected) === -1;
    }
});
