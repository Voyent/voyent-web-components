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
     * Fires when the alert template label changes. Includes a `label` property that contains the new value.
     * @event voyent-alert-template-label-changed
     */

    /**
     * Fires when an alert zone label changes. Includes a `label` property that contains
     * the new value and an `id` property that indicates which zone was modified.
     * @event voyent-alert-zone-label-changed
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
     * Fires when the selected alert zone changes. Includes an `id` property which identifies the zone and a `zone`
     * property containing the assocaited data. If no zone is selected then both of these values will be null.
     * @event voyent-alert-zone-selected
     */

    properties: {
        /**
         * Indicate whether to to hide the embedded save and cancel buttons.
         * @default false
         */
        hideButtons: { type: Boolean, value: false }
    },

    observers: ['_loadedTemplateChanged(_loadedAlertTemplateData)'],

    /**
     * Loads an Alert Template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
        this._loadingAlertTemplate = true;
        var _this = this;
        voyent.locate.findTrackers({
            realm: this.realm,
            account: this.account,
            query: {"_id":id}
        }).then(function (results) {
            if (!results || !results.length) {
                _this.fire('message-error', 'Alert Template not found');
                return;
            }
            //Clear the map of any loaded Alert Template before drawing. Specify that we want to skip the button
            //draw because we will remove the buttons after drawing the new alert template. Without this we
            //intermittently encounter a bug where the buttons are displayed after loading the template.
            if (_this._loadedAlertTemplateData) {
                _this.clearMap(false,true);
            }
            //Draw the new Alert Template.
            _this._drawAlertEntity(results[0]);
            _this._loadingAlertTemplate = false;
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading or drawing saved Alert Template: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Opens a confirmation prompt for cancelling alert template creation or edits.
     * @private
     */
    cancel: function() {
        var msg;
        if (this._loadedAlertTemplateData.isPersisted) {
            msg = 'Are you sure you want to revert all unsaved changes for "' +
                this._loadedAlertTemplateData.alertTemplate.label + '"? This action cannot be undone.';
        }
        else {
            msg = 'Are you sure you want to cancel creating ' +
                this._loadedAlertTemplateData.alertTemplate.label + '? This action cannot be undone.';
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
     * Revert the editor to it's state when the Alert Template was originally loaded or clears an unsaved Alert Template.
     */
    _cancelChanges: function() {
        //Clear the map and fire an event indicating we cancelled.
        this.clearMap();
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
            if (oce.type === 'marker') { //Marker is actually a circle alertTemplate
                //Create the new google maps circle and bind the circle (zone) to the marker (anchor).
                var newCircle = new google.maps.Circle(_this._getCircleProperties());
                newCircle.bindTo('center', oce.overlay, 'position');
                //Build the JSON structure for the alertTemplate template.
                var alertTemplate = _this._getAlertTemplateJSON();
                alertTemplate.label = _this._dialogInput;
                alertTemplate.anchor.geometry.coordinates = [shape.getPosition().lng(),shape.getPosition().lat()];
                alertTemplate.zones.features[0].tmpProperties.circle = newCircle;
                //Store the various pieces together so we can reference them later.
                _this.set('_loadedAlertTemplateData', {"alertTemplate":alertTemplate,"marker":shape,"isPersisted":false});
                //Determine and set the coordinates for the circle.
                _this._updateAlertTemplateJSON(_this._loadedAlertTemplateData);
                //Draw the Proximity Zone label overlay and save a reference to it.
                alertTemplate.zones.features[0].tmpProperties.zoneOverlay = new _this._ProximityZoneOverlay(alertTemplate.zones.features[0]);
                //Disable further Alert Template creations - only allowed one at a time.
                _this._removeAlertTemplateButtons();
                //Add the listeners to the marker and circles.
                _this._setupMapListeners(_this._loadedAlertTemplateData);
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
     * The listener to fire when the marker button is clicked.
     * @private
     */
    _circleButtonListener: function() {
        var _this = this;
        this._openDialog('Please enter the Alert Template name','',function() {
            _this._drawingManager.setDrawingMode(google.maps.drawing.OverlayType.MARKER);
        });
    },

    /**
     * The listener to fire when the polygon button is clicked.
     * @private
     */
    _polygonButtonListener: function() {
        this._openDialog('Whoops, this button is not hooked up yet!');
    },

    /**
     * Returns the default JSON structure of an Alert Template.
     * @returns {{anchor: {type: string, geometry: {type: string, coordinates: Array}, properties: {Editable: string}}, zones: {type: string, features: [*]}}}
     * @private
     */
    _getAlertTemplateJSON: function() {
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
            //These properties are used by the view and will be removed before saving the alertTemplate.
            "tmpProperties": this._getAlertTemplateTmpProperties()
        }
    },

    /**
     * Fires an event indicating that the loaded alert template has changed.
     * @param data
     * @private
     */
      _loadedTemplateChanged: function(data) {
        this.fire('voyent-alert-template-changed',{
            'alertTemplate': data && data.alertTemplate ? data.alertTemplate : null
        });
    }
});
