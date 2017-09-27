Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the alert template is successfully saved. Does not include any data.
     * @event voyent-alert-template-saved
     */

    /**
     * Fires when the loaded alert template changes. Includes an `alertTemplate`
     * property that contains the loaded template or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    /**
     * Fires when the alert template name changes. Includes a `name` property that contains the new value.
     * @event voyent-alert-template-name-changed
     */

    /**
     * Fires when an alert zone name changes. Includes a `name` property that contains
     * the new value and an `id` property that indicates which zone was modified.
     * @event voyent-alert-zone-name-changed
     */

    /**
     * Fires when a new alert zone is added to the template. Includes an `id` property
     * which identifies the zone and a `zone` property that contains the associated data.
     * @event voyent-alert-zone-added
     */

    /**
     * Fired when an alert zone is removed from the template. Includes an `id` property which identifies the zone.
     * @event voyent-alert-zone-removed
     */

    /**
     * Fires when the selected alert zone changes. Includes an `index` property in relation to the list, `id` property
     * which identifies the zone and a `zone` property containing the associated data. If no zone is selected then the
     * index value will be -1 and the other properties will be null.
     * @event voyent-alert-zone-selected
     */

    properties: {
        /**
         * Indicate whether to to hide the embedded save and cancel buttons.
         * @default false
         */
        hideButtons: { type: Boolean, value: false }
    },

    observers: ['_loadedTemplateChanged(_loadedAlert.template)'],

    /**
     * Loads an alert template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
        var _this = this;
        this._fetchAlertTemplate(id).then(function(template) {
            //Clear the map of any loaded alert template before drawing. Specify that we want to skip the button
            //draw because we will remove the buttons after drawing the new alert template. Without this we
            //intermittently encounter a bug where the buttons are displayed after loading the template.
            if (_this._loadedAlert) {
                _this.clearMap(true);
            }
            _this._drawAndLoadAlertTemplate(template);
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
        this._addCircleButton(this._circleButtonListener.bind(this));
        this._addPolygonButton(this._polygonButtonListener.bind(this));
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRealmRegion();
    },

    /**
     * Initialize the listeners for drawing a new alert template on the map.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this, zone;
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            //Build our stack marker, the position will be added later.
            var stackMarker = new google.maps.Marker({
                map: _this._map, draggable: true, zIndex: 50
            });
            if (oce.type === 'circle') { //Circular template.
                stackMarker.setPosition(oce.overlay.getCenter());
                zone = new _this._CircularAlertZone(oce.overlay.getRadius());
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
                zone = new _this._PolygonalAlertZone(paths);
            }
            var zoneStack = new _this._AlertZoneStack(stackMarker, [zone]);
            if (_this._loadedAlert) {
                //Add the stack and select it.
                _this._loadedAlert.template.addZoneStack(zoneStack);
                //Toggle the accordion closed for the current stack and load the new one.
                _this._toggleAccordion(-1);
                _this.set('_loadedAlert.selectedStack',zoneStack);
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
            }
            else {
                //Since we only have one stack we won't pass a marker to
                //the template since the stack has it's own marker.
                _this.set('_loadedAlert',{
                    template: new _this._AlertTemplate(
                        null, null, _this._dialogInput, null, [zoneStack]
                    ),
                    selectedStack: zoneStack
                });
            }
            //To keep things simple we'll always use our custom classes for
            //drawing the shapes so remove the google-drawn shape from the map.
            oce.overlay.setMap(null);
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
     * The listener to fire when the marker button is clicked.
     * @private
     */
    _circleButtonListener: function() {
        var _this = this;
        this._dialogInput = 'Circular Template';
        //this._openDialog('Please enter the alert template name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.CIRCLE);
        //});
    },

    /**
     * The listener to fire when the polygon button is clicked.
     * @private
     */
    _polygonButtonListener: function() {
        var _this = this;
        this._dialogInput = 'Polygonal Template';
        //this._openDialog('Please enter the alert template name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
        //});
    },

    /**
     * Fires an event indicating that the loaded alert template has changed.
     * @param alertTemplate
     * @private
     */
      _loadedTemplateChanged: function(alertTemplate) {
        this.fire('voyent-alert-template-changed',{
            'alertTemplate': alertTemplate || null
        });
    }
});
