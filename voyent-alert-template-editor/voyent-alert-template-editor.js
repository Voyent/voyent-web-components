Polymer({
    is: 'voyent-alert-template-editor',

    properties: {
        /**
         * The Voyent account used for authentication.
         * @default voyent.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * The Voyent realm to create the Alert Template in.
         * @default voyent.io.auth.getLastKnownRealm()
         */
        realm: { type: String },
        /**
         * The height of the google map to be created, as an integer. If left empty we will default to the height
         * of the parent container. If a height cannot be found then a default minimum of 500 will be used.
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
        //Default to the last realm and account if one is not set.
        if (!this.realm) {
            this.realm = voyent.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = voyent.io.auth.getLastKnownAccount();
        }

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
            //Fire event indicating the map is loaded.
            _this.fire('mapInitialized', {map: _this._map});
            //Calculate the map size.
            _this._calcMapSize();
             //Setup ui and listeners for adding new alert templates.
            _this._drawingManager = new google.maps.drawing.DrawingManager({
                map:_this._map,
                drawingControlOptions: {
                    position: google.maps.ControlPosition.TOP_RIGHT,
                    drawingModes: ['marker']
                },
                markerOptions: {draggable:true, 'zIndex':50}
            });
            _this._setupDrawingListeners();
            //Make sure the map is sized correctly when the window size changes.
            google.maps.event.addListener(window, 'resize', function () {
                _this.resizeMap();
            });

            //Initialize some vars
            _this._selected = _this._editing = _this._addingNew = false;
            _this._trackerData = null;
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
     * Re-calculates the map size and fires the Google Map resize event.
     */
    resizeMap: function() {
        if (('google' in window) && this._map) {
            this._calcMapSize();
            google.maps.event.trigger(this._map, 'resize');
        }
    },

    /**
     * Saves or updates the current Alert Template.
     * @private
     */
    saveTracker: function () {
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
            id: tracker._id //Not valid if 'createTracker' but no harm in passing it anyway.
        }).then(function (uri) {
            if (func === 'createTracker') {
                //Grab the generated ID from the return URI and setup change listeners
                _this.set('_trackerData.tracker._id',uri ? uri.split('/').pop() : _this._trackerData.tracker._id);
                _this.fire('message-info', 'Alert Template successfully created.');
            }
            else {
                _this.fire('message-info', 'Alert Template successfully updated.');
            }
        }).catch(function (error) {
            if (func === 'createTracker') {
                //If the initial creation fails then remove it from the map.
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
     * Toggles renaming mode for an Alert Template.
     * @private
     */
    _toggleTrackerRenaming: function() {
        var renaming = !this.get('_trackerData.tracker.tmpProperties.renaming');
        if (renaming) {
            //Set the input value to the current zoneId.
            this.set('_trackerData.tracker.tmpProperties.newName',this.get('_trackerData.tracker.label'));
        }
        //Toggle renaming mode.
        this.set('_trackerData.tracker.tmpProperties.renaming',renaming);
    },

    /**
     * Confirms the renaming of an Alert Template.
     * @private
     */
    _renameTracker: function() {
        //Set the new label and reset the editing mode input state.
        this.set('_trackerData.tracker.label',this.get('_trackerData.tracker.tmpProperties.newName'));
        this.set('_trackerData.tracker.tmpProperties.newName','');
        //Toggle renaming mode.
        this._toggleTrackerRenaming();
    },

    /**
     * Removes the current tracker from the database.
     * @private
     */
    _removeTracker: function() {
        var confirm = window.confirm("Are you sure you want to delete '" + this._trackerData.tracker.label + "'? This cannot be undone!");
        if (!confirm) {
            return;
        }
        //Remove the marker and circles form the map.
        this._trackerData.marker.setMap(null);
        for (var i=0; i<this._trackerData.circles.length; i++) {
            this._trackerData.circles[i].setMap(null);
        }
        //Wipe all references to the tracker and re-enable drawing mode.
        this._trackerData = null;
        this._drawingManager.setOptions({
            "drawingControlOptions":{
                "drawingModes":['marker'],
                "position":google.maps.ControlPosition.TOP_RIGHT}
        });
    },

    /**
     * Toggles the accordion panels. This is used to toggle the accordion
     * for both accordion pane and proximity zone clicks.
     * @param eOrI
     * @private
     */
    _toggleAccordion: function(eOrI) {
        //This function will either be passed an event (from the ui) or a direct index (from the JS).
        var index = eOrI.model ? eOrI.model.get('index') : eOrI;
        for (var i=0; i<this._trackerData.tracker.zones.features.length; i++) {
            //Hide the accordions and remove the selected styling.
            this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.visible',false);
            this._trackerData.circles[i].setOptions({"strokeWeight":0});
        }
        //Show the accordion contents for the selected zone and add the selected styling.
        this.set('_trackerData.tracker.zones.features.'+index+'.tmpProperties.visible',true);
        this._trackerData.circles[index].setOptions({"strokeWeight":3});
    },

    /**
     * Adds a new proximity zone to the Alert Template. The new zone is 50% larger than the largest existing zone.
     * @private
     */
    _addProximityZone: function() {
        var smallestIndex = 50, //50 because the highest index ever is 49
            largestRadius = 0; //0 because every zone will be bigger
        //Get the size of largest circle and our smallest zIndex so we can determine what values to set for the new one
        for (var i=0; i<this._trackerData.circles.length; i++) {
            if (this._trackerData.tracker.zones.features[i].properties.googleMaps.radius >= largestRadius) {
                largestRadius = this._trackerData.tracker.zones.features[i].properties.googleMaps.radius;
            }
            if (this._trackerData.tracker.zones.features[i].properties.googleMaps.zIndex <= smallestIndex){
                smallestIndex = this._trackerData.tracker.zones.features[i].properties.googleMaps.zIndex;
            }
        }
        //Set the new zone radius as 50% larger than the current largest zone.
        largestRadius = largestRadius + largestRadius * 0.5;
        //Set the new zone zIndex slightly lower so it sits behind the other zones.
        smallestIndex = smallestIndex - 1;

        //Build the properties for the new circle.
        var props = this._getCircleProperties();
        props.radius = largestRadius;
        props.zIndex = smallestIndex;
        //Create the google maps circle and bind it to the marker.
        var newCircle = new google.maps.Circle(props);
        newCircle.bindTo('center', this._trackerData.marker, 'position');

        //Build the geoJSON structure for the proximity zone.
        var newCircleJSON = this._getZoneJSON();
        newCircleJSON.properties.zoneId = this._trackerData.tracker.zones.features.length + 1;
        //Update our lists.
        this.push('_trackerData.tracker.zones.features',newCircleJSON);
        this.push('_trackerData.circles',newCircle);
        //Add the change listeners to the new circle.
        this._setupChangeListeners();
        //Update the JSON to include the new circle.
        this._updateAlertTemplateJSON();
    },

    /**
     * Removes a Proximity Zone from the Alert Template.
     * @private
     */
    _removeProximityZone: function(e) {
        //Get the index of the proximity zone that is to be removed.
        var i = e.model.get('index');
        //Remove the zone from the tracker JSON.
        this.splice('_trackerData.tracker.zones.features',i,1);
        //Remove the circle from the map and the reference to it.
        this._trackerData.circles[i].setMap(null);
        this.splice('_trackerData.circles',i,1);
    },

    /**
     * Toggles renaming mode for Proximity Zones.
     * @param eOrI
     * @private
     */
    _toggleProximityZoneRenaming: function(eOrI) {
        //This function will either be passed an event (from the ui) or a direct index (from the JS).
        var i = eOrI.model ? eOrI.model.get('index') : eOrI;
        var renaming = !this.get('_trackerData.tracker.zones.features.'+i+'.tmpProperties.renaming');
        if (renaming) {
            //Set the input value to the current zoneId.
            this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName',
                     this.get('_trackerData.tracker.zones.features.'+i+'.properties.zoneId'));
        }
        //Toggle renaming mode.
        this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.renaming',renaming);
    },

    /**
     * Confirms the renaming of a Proximity Zone.
     * @param e
     * @private
     */
    _renameProximityZone: function(e) {
        var i = e.model.get('index');
        //Set the new zoneId and reset the editing mode input state.
        this.set('_trackerData.tracker.zones.features.'+i+'.properties.zoneId',
                 this.get('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName'));
        this.set('_trackerData.tracker.zones.features.'+i+'.tmpProperties.newName','');
        //Toggle renaming mode.
        this._toggleProximityZoneRenaming(i);
    },

    /**
     * Toggles Proximity Zone property editing mode.
     * @param e - The event from the template or null if this was toggled after a successful save.
     * @private
     */
    _togglePropertyEditing: function(e) {
        var _this = this;
        this._editing = !this._editing;
        var index = e ? e.model.get('index') : null;
        if (this._editing) { //We are entering edit mode.
            var properties = this._trackerData.tracker.zones.features[index].properties;
            switch (this._selected) {
                //Copy the current state of each of the properties into our editing mode inputs.
                case 'Editable':
                    //Convert boolean to string for UI.
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

            //Setup the jscolor picker.
            setTimeout(function() {
                jscolor.installByClassName("jscolor");
            },0);
        }
        else { //We are exiting editing mode.
            //Clear the editing mode inputs.
            this._editableVal = this._colorVal = this._opacityVal = this._customPropKey = this._customPropVal = null;
        }
    },

    /**
     * Confirms the edit of a Proximity Zone property.
     * @param e
     * @private
     */
    _editProperty: function(e) {
        var _this = this;
        var index = e.model.get('index');
        //Clone properties and re-set it so the computed binding _toArray updates.
        var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
        switch (this._selected) {
            //Copy the new property value from our editing mode inputs to the JSON. We don't bind directly in case we need to revert.
            case 'Editable':
                properties['Editable'] = this._editableVal.toLowerCase() === 'true'; //Convert string from UI to boolean
                //Set the Editable state on the circle.
                this._trackerData.circles[index].setEditable(properties.Editable);
                this.set('_editableVal',null);
                break;
            case 'Color':
                properties['Color'] = this._colorVal;
                //Set the Color on the circle.
                this._trackerData.circles[index].setOptions({"fillColor":'#'+properties.Color});
                this.set('_colorVal',null);
                break;
            case 'Opacity':
                properties['Opacity'] = this._opacityVal;
                //Set the Opacity on the circle.
                this._trackerData.circles[index].setOptions({"fillOpacity":properties.Opacity});
                this.set('_opacityVal',null);
                break;
            default:
                properties[this._customPropKey] = this._customPropVal;
                //If the selected property key changed delete the old one and update the table selection.
                if (this._selected !== this._customPropKey) {
                    delete properties[this._selected];
                    setTimeout(function() {
                        _this._selected = _this._customPropKey;
                        //Reset the editing mode inputs.
                        _this._customPropKey = _this._customPropVal = null;
                    },0);
                }
        }
        this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
        //Toggle editing mode.
        this._togglePropertyEditing(null);
    },

    /**
     * Toggles new property mode for a Proximity Zone.
     * @param e
     * @private
     */
    _toggleAddingNewProperty: function(e) {
        this._addingNew = !this._addingNew;
    },

    /**
     * Saves a new custom property.
     * @param e
     * @private
     */
    _saveNewProperty: function(e) {
        if (this._customPropKey && this._customPropVal) {
            var index = e.model.get('index');
            //Clone properties and re-set it so the computed binding _toArray updates.
            var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
            properties[this._customPropKey] = this._customPropVal;
            this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
            //Reset the new property input values.
            this._customPropKey = this._customPropVal = null;
            //Toggle new property mode.
            this._toggleAddingNewProperty();
        }
    },

    /**
     * Removes the currently selected property.
     * @param e
     * @private
     */
    _removeSelectedProperty: function(e) {
        var index = e.model.get('index');
        //Clone properties and re-set it so the computed binding _toArray updates.
        var properties = JSON.parse(JSON.stringify(this._trackerData.tracker.zones.features[index].properties));
        delete properties[this._selected];
        this.set('_trackerData.tracker.zones.features.'+index+'.properties',properties);
    },

    /**
     * Determine the map size to use. This will leverage this.height and this.width if available. Otherwise the parent
     * container size will be used. If this.autoheight is specified than it will override this.height.
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
                height = this.$$('#container').clientHeight;
            }
            // If we still don't have a valid height default to a minimum
            if (height < 50) {
                height = 500;
            }
        }
        // Apply the height variable, which will be used for the map
        this.customStyle['--height-var'] = height + 'px';
        this.updateStyles();

        //TODO - The styling needs to be adjusted for the width to work properly
        // If the width is specified then set it otherwise the map will just take up the space of the parent
        /*if (this.width && this.width !== null && this.width > 0) {
            this.$$('#map').style.width = this.width + 'px';
        }*/
    },

    /**
     * Syncs the tracker JSON with the current state of the map entities.
     * @private
     */
    _updateAlertTemplateJSON: function () {
        //Sync the marker coordinates with the tracker anchor in case the tracker position has moved.
        this._trackerData.tracker.anchor.geometry.coordinates = [this._trackerData.marker.getPosition().lng(),this._trackerData.marker.getPosition().lat()];
        var features = this._trackerData.tracker.zones.features;
        var N = 50; //The number of coordinates the circle approximation will have.
        var degreeStep = 360 / N; //The number of degrees in which each coordinate will be spaced apart.
        for (var i=0; i<features.length; i++) {
            //Sync the tracker zone properties with the zone drawn on the map.
            features[i].properties.googleMaps.radius = this._trackerData.circles[i].getRadius();
            features[i].properties.googleMaps.center = [this._trackerData.circles[i].getCenter().lat(),this._trackerData.circles[i].getCenter().lng()];
            features[i].properties.Color = this._trackerData.circles[i].get('fillColor').substring(1); //remove the '#'
            features[i].properties.googleMaps.zIndex = this._trackerData.circles[i].get('zIndex');
            //Reset the coordinates array since we'll recalculate them below.
            features[i].geometry.coordinates = [[]];
            for (var j=0; j<N; j++) {
                //Calculate and save the next coordinate.
                var latLng = google.maps.geometry.spherical.computeOffset(this._trackerData.circles[i].getCenter(),
                                                                          this._trackerData.circles[i].getRadius(),
                                                                          degreeStep * j);
                features[i].geometry.coordinates[0].push([latLng.lng(), latLng.lat()]);
            }
            //In addition to N coordinates we also need to copy the
            //first one to the last one to complete the circle.
            features[i].geometry.coordinates[0].push(features[i].geometry.coordinates[0][0]);
        }
    },

    /**
     * Initialize the listeners for drawing a new Alert Template on the map.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        var shape;
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            shape = oce.overlay;
            if (oce.type === 'marker') { //Marker is actually a circle tracker
                //Create the new google maps circle and bind the circle (zone) to the marker (anchor).
                var newCircle = new google.maps.Circle(_this._getCircleProperties());
                newCircle.bindTo('center', oce.overlay, 'position');
                //Build the JSON structure for the tracker template.
                var tracker = _this._getTrackerJSON();
                tracker.anchor.geometry.coordinates = [shape.getPosition().lng(),shape.getPosition().lat()];
                //Store the various pieces together so we can reference them later.
                _this._trackerData = {"tracker":tracker,"marker":shape,"circles":[newCircle]};
                //Determine and set the coordinates for the circle.
                _this._updateAlertTemplateJSON();
                //Disable further Alert Template creations - only allowed one at a time.
                _this._drawingManager.setOptions({
                    "drawingControlOptions":{
                        "drawingModes":[],
                        "position":google.maps.ControlPosition.TOP_RIGHT}
                });
                //Add the change listeners to the marker and circles.
                _this._setupChangeListeners();
            }
            //Exit drawing mode.
            _this._drawingManager.setDrawingMode(null);
        });
        //If the escape key is pressed then stop drawing
        //and cancel any polygons currently being drawn.
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
     * Initialize google map listeners for moving, resizing and clicking of Alert Templates.
     * @private
     */
    _setupChangeListeners: function() {
        var _this = this;
        if (this._trackerData.marker) {
            //Clear any previously added listeners (since we call this function again for newly added zones).
            google.maps.event.clearInstanceListeners(this._trackerData.marker);
            //Add drag listener to marker.
            google.maps.event.addListener(this._trackerData.marker, 'dragend', function (event) {
                //Update the JSON since the position changed.
                _this._updateAlertTemplateJSON();
            });
        }
        if (this._trackerData.circles) {
            for (var i=0; i<this._trackerData.circles.length; i++) {
                //Clear any previously added listeners (since we call this function again for newly added zones).
                google.maps.event.clearInstanceListeners(this._trackerData.circles[i]);
                //Add resize listener to circles.
                google.maps.event.addListener(this._trackerData.circles[i], 'radius_changed', function (event) {
                    //Update the JSON since the size of a zone changed.
                    _this._updateAlertTemplateJSON();
                });
                //Add click listener to circles.
                (function(i) {
                    google.maps.event.addListener(_this._trackerData.circles[i], 'click', function (event) {
                        _this._toggleAccordion(i);
                    });
                }(i))
            }
        }
    },

    /**
     * Monitors the number of zones that we the Alert Template has.
     * @param length
     * @private
     */
    _featuresChanged: function(length) {
        this.set('_hasOneZone',length === 1);
    },

    /**
     * Template helper for converting Proximity Zone properties object into an array so we can iterate them.
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
     * Template helper that determines if the currently selected property matches the passed key.
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
     * Template helper that determines if the passed property is allowed to be removed.
     * @param selected
     * @returns {boolean}
     * @private
     */
    _isRemoveableProperty: function(selected) {
        return !!selected && this._readOnlyProperties.indexOf(selected) === -1;
    },

    /**
     * Set the Proximity Zone properties list to be sorted by property keys.
     * @param e
     * @private
     */
    _sortByProperty: function(e) {
        this._sortType = 'key';
        this._sortDirectionAsc = !this._sortDirectionAsc;
        this.querySelector('#propertyRepeat-'+e.model.get('index')).render(); // force a re-sort
        this._maintainSelectionAfterSort();
    },

    /**
     * Set the Proximity Zone properties list to be sorted by property values.
     * @param e
     * @private
     */
    _sortByValue: function(e) {
        this._sortType = 'value';
        this._sortDirectionAsc = !this._sortDirectionAsc;
        this.querySelector('#propertyRepeat-'+e.model.get('index')).render(); // force a re-sort
        this._maintainSelectionAfterSort();
    },

    /**
     * Template helper for sorting the Proximity Zone properties table.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortProperties: function(a, b) {
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
     * If a row is selected when sorting and that row changes positions then the selected
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
     * Triggered each time a property row is selected and handles the de-selection of a previously selected row.
     * @param e
     * @param detail
     * @private
     */
    _onIronActivate: function(e,detail) {
        if (detail.selected === this._selected) {
            this.querySelector('#propertySelector-'+e.model.get('index')).selected = null;
            e.preventDefault();
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
                    "zIndex":50 //50 for the anchor and the zones will go from 49 down.
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
     * Returns the default JSON structure of a Proximity Zone.
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
                    "zIndex": 49 //49 for the first zone and -1 for each following zone
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
     * Returns the default properties for building a google maps circle, the entity that represents a Proximity Zone.
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
    }
});