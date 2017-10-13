Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert template changes. Includes an `alertTemplate`
     * property that contains the loaded template or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicate whether to hide the embedded save and cancel buttons.
         * @default false
         */
        hideButtons: { type: Boolean, value: false },
        /**
         * Indicates whether a template is currently being fetched from database and loaded into the editor.
         */
        isTemplateLoading: { type: Boolean, value: false, readOnly: true, notify: true },
        /**
         * Indicates whether a template is currently loaded in the editor.
         */
        isTemplateLoaded: { type: Boolean, value: false, readOnly:true, notify: true }
    },

    observers: [
        '_loadedTemplateChanged(_loadedAlert.template)',
        '_loadedAlertChanged(_loadedAlert)'
    ],

    /**
     * Loads an alert template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
        this._closeDialog(); //Ensure the dialog is closed before loading.
        this._setIsTemplateLoading(true);
        var _this = this;
        this._fetchAlertTemplate(id).then(function(template) {
            //Clear the map of any loaded alert template before drawing. Specify that we want to skip the button
            //draw because we will remove the buttons after drawing the new alert template. Without this we
            //intermittently encounter a bug where the buttons are displayed after loading the template.
            if (_this._loadedAlert) {
                _this.clearMap(true);
            }
            _this._drawAndLoadAlertTemplate(template);
            _this._setIsTemplateLoading(false);
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading saved alert template: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Opens a confirmation prompt for cancelling alert template creation or edits.
     * @private
     */
    cancel: function() {
        var msg;
        if (this._loadedAlert.template.id) {
            msg = 'Are you sure you want to revert all unsaved changes for "' +
                this._loadedAlert.template.name + '"? This action cannot be undone.';
        }
        else {
            msg = 'Are you sure you want to cancel creating ' +
                this._loadedAlert.template.name + '? This action cannot be undone.';
        }
        this._openDialog(msg,null,'clearMap');
    },


    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRealmRegion();
    },

    /**
     * Removes the current alert template.
     * @private
     */
    _removeAlertTemplate: function() {
        var _this = this;
        //Delete from DB if it's saved.
        if (this._loadedAlert.template.id) {
            voyent.locate.deleteAlertTemplate({
                realm: this.realm,
                account: this.account,
                id: this._loadedAlert.template.id
            }).then(function() {
                _this._removeAlertTemplateFromMap();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue deleting alert template: ' + (error.responseText || error.message || error));
            });
        }
        else {
            _this._removeAlertTemplateFromMap();
        }
    },

    /**
     * Initialize the listeners for drawing a new alert template on the map.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this, zone;
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            //Check if they drew a self-intersecting polygon and if so remove it from the map and notify them.
            if (oce.type === 'polygon') {
                var kinks = turf.kinks({
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": _this._AlertTemplate.calculateCoordinatesFromPaths(oce.overlay.getPaths())
                    }
                });
                if (kinks.features.length) {
                    _this.fire('message-error','The zone cannot self-intersect');
                    oce.overlay.setMap(null);
                    return;
                }
            }
            //Build our stack marker, the position will be added later.
            var stackMarker = new google.maps.Marker({
                map: _this._map, draggable: true, zIndex: 50
            });
            if (oce.type === 'circle') { //Circular template.
                stackMarker.setPosition(oce.overlay.getCenter());
                zone = new _this._CircularAlertZone(oce.overlay.getRadius(),_this._dialogInput);
            }
            else { //Polygonal template.
                //If cancelled via esc, Google will still draw the polygon so we need to remove it from the map.
                if (_this._drawingCanceled) {
                    oce.overlay.setMap(null);
                    _this._drawingCanceled = false;
                    return;
                }
                var paths = oce.overlay.getPaths();
                stackMarker.setPosition(_this._AlertTemplate.calculateCentroidFromPaths(paths));
                zone = new _this._PolygonalAlertZone(paths,_this._dialogInput);
            }
            var zoneStack = new _this._AlertZoneStack(stackMarker, [zone]);
            //Add the stack and fire the zone added event.
            _this._loadedAlert.template.addZoneStack(zoneStack);
            _this.fire('voyent-alert-zone-added',{"id":zone.id,"zone":zone,"stack":zoneStack,"isFallbackZone":false});
            //Toggle the accordion closed for the current stack and load the new one.
            _this._toggleProperties(-1);
            _this.set('_loadedAlert.selectedStack',zoneStack);
            _this._toggleProperties(0);
            //When we have only one stack we don't have a template marker, just the marker for the zone stack.
            //So once we have two zone stacks we need to create the marker and if we have more than two (the
            //marker exists already) then we'll update it's position.
            if (_this._loadedAlert.template.zoneStacks.length === 2) {
                _this._loadedAlert.template.setMarker(new google.maps.Marker({
                    position: _this._AlertTemplate.calculateCentroidFromJSON(_this._loadedAlert.template.json),
                    draggable: true, zIndex: 50,
                    map: _this._map,
                    icon: _this.pathtoimages+'/img/alert_marker.png'
                }));
            }
            else if (_this._loadedAlert.template.zoneStacks.length > 2) {
                _this._loadedAlert.template.updateJSONAndCentroid();
            }
            //To keep things simple we'll always use our custom classes for
            //drawing the shapes so remove the google-drawn shape from the map.
            oce.overlay.setMap(null);
            //Re-punch out the fallback zone.
            if (_this._fallbackZone) {
                _this._fallbackZone.punchOutOverlay();
            }
            //Exit drawing mode.
            _this._drawingManager.setDrawingMode(null);
        });
        //When the escape key is pressed exit drawing mode.
        window.addEventListener('keydown', function (event) {
            if (event.which === 27) {
                //Flag so overlaycomplete listener won't be allowed to proceed after cancelling a polygon mid-draw.
                _this._drawingCanceled = true;
                if (_this._drawingManager.getDrawingMode() !== null) {
                    _this._drawingManager.setDrawingMode(null);
                }
            }
        });
    },

    /**
     * The listener to fire when the circle button is clicked.
     * @private
     */
    _circleButtonListener: function() {
        var _this = this;
        this._openDialog('Please enter the zone name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.CIRCLE);
        });
    },

    /**
     * The listener to fire when the polygon button is clicked.
     * @private
     */
    _polygonButtonListener: function() {
        var _this = this;
        this._openDialog('Please enter the zone name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
        });
    },

    /**
     * Fires an event indicating that the loaded alert template has changed and manages the templateLoaded property state.
     * @param alertTemplate
     * @private
     */
      _loadedTemplateChanged: function(alertTemplate) {
        this._setIsTemplateLoaded(!!alertTemplate);
        this.fire('voyent-alert-template-changed',{
            'alertTemplate': alertTemplate || null
        });
    },

    /**
     * Manages the drawing button states based on whether an alert is loaded.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        if (loadedAlert) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading a template as they will just be added again.
        else if (!this.isTemplateLoading) {
            this._removeAlertTemplateButtons();
        }
    }
});
