Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertBehaviour],

    /**
     * Loads an Alert Template into the editor based on the passed id.
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
            if (_this._alertTemplateData) {
                _this.clearMap();
            }
            //Draw the new Alert Template.
            _this._drawAlertTemplate(results[0]);
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading or drawing saved Alert Template: ' + error);
        });
    },

    /**
     * Set an optional message template on a per zone basis
     * This will be saved along with the rest of the alert template, and is used for notifications
     * The data for the message template will likely come from the voyent-transport-editor
     * The specific JSON location to save is as a property of the zone, so zones.features[x].properties.messageTemplate
     */
    setMessageTemplate: function(messageTemplate, zoneId) {
        // Ensure we have valid template data, zones, and features
        if (zoneId && this._alertTemplateData && this._alertTemplateData.alertTemplate && this._alertTemplateData.alertTemplate.zones &&
            this._alertTemplateData.alertTemplate.zones.features && this._alertTemplateData.alertTemplate.zones.features.length > 0) {
            // Loop through the zones and look for a match against the passed zone ID
            for (var i = 0; i < this._alertTemplateData.alertTemplate.zones.features.length; i++) {
                if (zoneId == this._alertTemplateData.alertTemplate.zones.features[i].properties.zoneId) {
                    this._alertTemplateData.alertTemplate.zones.features[i].properties.messageTemplate = messageTemplate;
                    break;
                }
            }
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
            if (oce.type === 'marker') { //Marker is actually a circle alertTemplate
                //Create the new google maps circle and bind the circle (zone) to the marker (anchor).
                var newCircle = new google.maps.Circle(_this._getCircleProperties());
                newCircle.bindTo('center', oce.overlay, 'position');
                //Build the JSON structure for the alertTemplate template.
                var alertTemplate = _this._getAlertTemplateJSON();
                alertTemplate.anchor.geometry.coordinates = [shape.getPosition().lng(),shape.getPosition().lat()];
                //Store the various pieces together so we can reference them later.
                _this._alertTemplateData = {"alertTemplate":alertTemplate,"marker":shape,"circles":[newCircle],"zoneOverlays":[],"highestLats":[],"isPersisted":false};
                //Determine and set the coordinates for the circle.
                _this._updateAlertTemplateJSON();
                //Draw the Proximity Zone label overlay and save a reference to it.
                _this.push('_alertTemplateData.zoneOverlays',new _this._ProximityZoneOverlay(0));
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
    }
});
