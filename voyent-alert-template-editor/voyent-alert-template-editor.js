Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Loads an Alert Template into the editor using the passed id.
     * @param id
     */
    loadAlertTemplate: function(id) {
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
            //Clear the map of any loaded Alert Template before drawing.
            if (_this._loadedAlertTemplateData) {
                _this.clearMap();
            }
            //Draw the new Alert Template.
            _this._drawAlertEntity(results[0]);
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading or drawing saved Alert Template: ' + error);
        });
    },

    /**
     * Set an optional message template on a per zone basis.
     * This will be saved along with the rest of the alert template, and is used for notifications.
     * The data for the message template will likely come from the voyent-transport-editor.
     * The specific JSON location to save is as a property of the zone, so zones.features[x].properties.messageTemplate.
     */
    setMessageTemplate: function(messageTemplate, zoneId) {
        // Ensure we have valid template data, zones, and features
        if (zoneId && this._loadedAlertTemplateData && this._loadedAlertTemplateData.alertTemplate && this._loadedAlertTemplateData.alertTemplate.zones &&
            this._loadedAlertTemplateData.alertTemplate.zones.features && this._loadedAlertTemplateData.alertTemplate.zones.features.length > 0) {
            // Loop through the zones and look for a match against the passed zone ID
            for (var i = 0; i < this._loadedAlertTemplateData.alertTemplate.zones.features.length; i++) {
                if (zoneId == this._loadedAlertTemplateData.alertTemplate.zones.features[i].properties.zoneId) {
                    this._loadedAlertTemplateData.alertTemplate.zones.features[i].properties.messageTemplate = messageTemplate;
                    break;
                }
            }
        }
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        //Only enable the marker when we are logged in.
        this._drawingManager.setOptions({
            "drawingControlOptions":{
                "drawingModes":['marker'],
                "position":google.maps.ControlPosition.TOP_RIGHT}
        });
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRegions();
    },

    /**
     * Revert the editor to it's state when the Alert Template was originally loaded or clears an unsaved Alert Template.
     */
    _cancelChanges: function() {
        var confirm = false;
        if (this._loadedAlertTemplateData.isPersisted) {
            confirm = window.confirm('Are you sure you want to revert all unsaved changes for "' +
                      this._loadedAlertTemplateData.alertTemplate.label + '"? This action cannot be undone.');
            if (!confirm) { return; }
            //Clear the map and revert the loaded Alert Template to latest persisted value.
            var original = this._loadedAlertTemplateData.persistedAlertTemplate;
            this.clearMap();
            this._drawAlertEntity(original);
        }
        else {
            confirm = window.confirm('Are you sure you want to cancel creating "' +
            this._loadedAlertTemplateData.alertTemplate.label + '"? This action cannot be undone.');
            if (!confirm) { return; }
            //Simply clear the map since there is no Alert Template saved.
            this.clearMap();
        }
        //Fire an event for anyone interested.
        this.fire('voyent-alert-template-cancel',{});
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
                if (!google.maps.geometry.poly.containsLocation(shape.getPosition(), _this._areaRegion.polygon)) {
                    _this.fire('message-info','The Alert Template center must be inside your region.');
                    oce.overlay.setMap(null);
                    return;
                }
                //Prompt the Alert Template name immediately.
                var templateName = promptForLabel();
                if (!templateName) {
                    //Cancelled so delete the marker and disable drawing mode.
                    oce.overlay.setMap(null);
                    _this._drawingManager.setDrawingMode(null);
                    return;
                }
                //Create the new google maps circle and bind the circle (zone) to the marker (anchor).
                var newCircle = new google.maps.Circle(_this._getCircleProperties());
                newCircle.bindTo('center', oce.overlay, 'position');
                //Build the JSON structure for the alertTemplate template.
                var alertTemplate = _this._getAlertTemplateJSON();
                alertTemplate.label = templateName;
                alertTemplate.anchor.geometry.coordinates = [shape.getPosition().lng(),shape.getPosition().lat()];
                alertTemplate.zones.features[0].tmpProperties.circle = newCircle;
                //Store the various pieces together so we can reference them later.
                _this._loadedAlertTemplateData = {"alertTemplate":alertTemplate,"marker":shape,"isPersisted":false};
                //Determine and set the coordinates for the circle.
                _this._updateAlertTemplateJSON();
                //Draw the Proximity Zone label overlay and save a reference to it.
                alertTemplate.zones.features[0].tmpProperties.zoneOverlay = new _this._ProximityZoneOverlay(alertTemplate.zones.features[0]);
                //Disable further Alert Template creations - only allowed one at a time.
                _this._drawingManager.setOptions({
                    "drawingControlOptions":{
                        "drawingModes":[],
                        "position":google.maps.ControlPosition.TOP_RIGHT}
                });
                //Add the change listeners to the marker and circles.
                _this._setupChangeListeners(_this._loadedAlertTemplateData);
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
        /**
         * Handles displaying the Alert Template label prompt. Returns the entered value.
         * @returns {*}
         */
        function promptForLabel() {
            var templateName = window.prompt("Please enter the Alert Template name",'');
            if (templateName === null) { return null; } //Cancelled.
            else if (templateName.trim() === '') { return promptForLabel(); } //Empty name, dialog again.
            return templateName;
        }
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
    }
});
