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

    observers: ['_loadedTemplateChanged(_loadedAlertTemplate)'],

    /**
     * Loads an alert template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
        this._loadingAlertTemplate = true;
        var _this = this;
        this._fetchAlertTemplate(id).then(function(template) {
            //Clear the map of any loaded alert template before drawing. Specify that we want to skip the button
            //draw because we will remove the buttons after drawing the new alert template. Without this we
            //intermittently encounter a bug where the buttons are displayed after loading the template.
            if (_this._loadedAlertTemplate) {
                _this.clearMap(true);
            }
            _this._drawAndLoadAlertTemplate(template);
            _this._loadingAlertTemplate = false;
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
        if (this._loadedAlertTemplate.id) {
            msg = 'Are you sure you want to revert all unsaved changes for "' +
                this._loadedAlertTemplate.name + '"? This action cannot be undone.';
        }
        else {
            msg = 'Are you sure you want to cancel creating ' +
                this._loadedAlertTemplate.name + '? This action cannot be undone.';
        }
        this._openDialog(msg,null,'_cancelChanges');
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        //If the component is first loaded by a call to loadAlertTemplate we want to skip adding
        //the buttons since that call will remove them anyway. Without this we intermittently
        //encounter a bug where the buttons are displayed after loading the template.
        if (!this._loadingAlertTemplate) {
            this._addCircleButton(this._circleButtonListener.bind(this));
            this._addPolygonButton(this._polygonButtonListener.bind(this));
        }
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRealmRegion();
    },

    /**
     * Revert the editor to it's state when the alert template was originally loaded or clears an unsaved alert template.
     */
    _cancelChanges: function() {
        //Clear the map and fire an event indicating we cancelled.
        this.clearMap();
    },

    /**
     * Initialize the listeners for drawing a new alert template on the map.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this, zones;
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', function (oce) {
            var marker = new google.maps.Marker({
                map: _this._map, draggable: true, zIndex: 50
            });
            if (oce.type === 'circle') { //Circular template.
                marker.setPosition(oce.overlay.getCenter());
                zones = [new _this._CircularAlertZone(oce.overlay.getRadius())];
            }
            else { //Polygonal template.
                //If cancelled via esc, Google will still draw the polygon so we need to remove it from the map.
                if (_this._drawingCanceled) {
                    oce.overlay.setMap(null);
                    _this._drawingCanceled = false;
                    return;
                }
                var paths = oce.overlay.getPaths();
                marker.setPosition(_this._AlertTemplate.calculateCentroidUsingPaths(paths));
                zones = [new _this._PolygonalAlertZone(paths)];
            }
            //To keep things simple we'll always use our custom classes for
            //drawing the shapes so remove this google-drawn one from the map.
            oce.overlay.setMap(null);
            //Create our new template using the calculated marker and zones.
            _this._loadedAlertTemplate = new _this._AlertTemplate(_this._dialogInput, marker, zones, null);
            //Disable further alert template creations - only allowed one at a time.
            _this._removeAlertTemplateButtons();
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
        this._dialogInput = 'test';
        this._openDialog('Please enter the alert template name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.CIRCLE);
        });
    },

    /**
     * The listener to fire when the polygon button is clicked.
     * @private
     */
    _polygonButtonListener: function() {
        var _this = this;
        this._dialogInput = 'test';
        this._openDialog('Please enter the alert template name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
        });
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
