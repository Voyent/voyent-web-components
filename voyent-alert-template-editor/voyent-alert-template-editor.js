Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

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

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
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
     * Retrieves all the regions for the realm.
     * @returns {*}
     * @private
     */
    _fetchRegions: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            voyent.locate.getAllRegions({realm:_this.realm,account:_this.account}).then(function (regions) {
                //Filter out the Alert regions and we should only be left with the static area Region.
                _this._drawRegion(regions.filter(function(region) {
                   return !region.location.properties || !region.location.properties.trackerId;
                })[0]);
                resolve();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue fetching or drawing Region ' + error.responseText || error.message || error);
                console.error('Issue fetching or drawing Region', error.responseText || error.message || error);
                reject(error);
            });
        });
    },

    /**
     * Revert the editor to it's state when the Alert Template was originally loaded or clears an unsaved Alert Template.
     */
    _cancelChanges: function() {
        var confirm = false;
        if (this._alertTemplateData.isPersisted) {
            confirm = window.confirm('Are you sure you want to revert all unsaved changes for "' +
                      this._alertTemplateData.alertTemplate.label + '"? This action cannot be undone.');
            if (!confirm) { return }
            //Clear the map and revert the loaded Alert Template to the value saved in the DB.
            var original = this._alertTemplateData.persistedAlertTemplate;
            this.clearMap();
            this._drawAlertTemplate(original);
        }
        else {
            confirm = window.confirm('Are you sure you want to cancel creating "' +
            this._alertTemplateData.alertTemplate.label + '"? This action cannot be undone.');
            if (!confirm) { return }
            //Simply clear the map since there is no Alert Template saved.
            this.clearMap();
        }
        //Fire an event for anyone interested.
        this.fire('voyent-alert-template-cancel',{});
    },

    /**
     * Draws the passed polygon region on the map.
     * @param region
     * @private
     */
    _drawRegion: function(region) {
        if (!region || !region.location || !region.location.geometry || !region.location.geometry.coordinates) {
            return;
        }
        this._regionBounds = new google.maps.LatLngBounds();
        var coords = region.location.geometry.coordinates,
        googlePoint, paths = [], path = [];
        //Generate the ordered sequence of coordinates that completes the Polygon shape.
        for (var j = 0; j < coords.length; j++) {
            for (var k = 0; k < coords[j].length; k++) {
                googlePoint = new google.maps.LatLng(coords[j][k][1], coords[j][k][0]);
                path.push(googlePoint);
                //Extend our bounds object so we can pan the map later.
                this._regionBounds.extend(googlePoint);
            }
            paths.push(path);
        }
        //Draw the Polygon.
        new google.maps.Polygon({
            'paths': paths,
            'map': this._map,
            'editable': false
        });
        //Zoom on the newly drawn Region.
        this._map.fitBounds(this._regionBounds);
        this._map.panToBounds(this._regionBounds);
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
