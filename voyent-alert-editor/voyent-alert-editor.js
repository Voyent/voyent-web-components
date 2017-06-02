Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertBehaviour],

    properties: {
        /**
         * The relative path to the `images` resource directory. This may be
         * necessary when using the component as part of a custom build.
         */
        pathtoimages: { type: String, value: '.', observer: '_pathtoimagesChanged' },
    },

    /**
     * Fetches the list of Alert Templates for the realm.
     */
    _fetchAlertTemplates: function() {
        var _this = this;
        voyent.locate.getAllTrackers({realm:this.realm,account:this.account}).then(function(templates) {
            _this._alertTemplates = templates.filter(function(alertTemplate) {
                //Don't show child Alert Templates.
                return !alertTemplate.properties || !alertTemplate.properties.parentTrackerId;
            });
            console.log('_fetchAlertTemplates',_this._alertTemplates,'actual:',templates.length);
            _this._addAlertButton();
        }).catch(function (error) {
            _this.fire('message-error', 'Issue fetching Alert Templates ' + error.responseText || error.message);
            console.error('Issue fetching Alert Templates', error.responseText || error.message);
        })
    },

    /**
     * Handles adding button for creating Alerts.
     * @private
     */
    _addAlertButton: function() {
        if (!this._alertBttnAdded && this._alertTemplates && this._alertTemplates.length) {
            var _this = this;
            var alertBttn = this.$.alertBttn.cloneNode(true);
            alertBttn.onclick = this._selectAlertBttn.bind(this);
            this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(alertBttn);
            //delay so that the button isn't shown on
            //the page before being moved into the map
            setTimeout(function () {
                alertBttn.hidden = false;
                _this._alertBttnAdded = true;
            }, 100);
        }
    },

    /**
     * Adds a listener to Google's native "Stop Drawing" button so we can de-activate our custom Alert Button.
     * @private
     */
    _addListenerToStopDrawingBttn: function() {
        var _this = this, bttn;
        waitForButton();

        function waitForButton() {
            bttn = _this.querySelector('[title="Stop drawing"]');
            if (!bttn) {
                setTimeout(waitForButton,500);
                return;
            }
            bttn.onclick = _this._deSelectAlertBttn.bind(_this);
        }
    },

    /**
     * Actives the Alert Button in the top right corner. Fired on-click.
     * @param e
     * @private
     */
    _selectAlertBttn:function(e) {
        //Change the button state and styling to selected.
        this._alertBttnSelected = !this._alertBttnSelected;
        this.toggleClass("selected", this._alertBttnSelected, this.querySelector('.customMapBttn'));

    },

    /**
     * Deactives the Alert Button in the top right corner. Fired on-click of "stop drawing" button or when pressing esc.
     * @param e
     * @private
     */
    _deSelectAlertBttn: function(e) {
        //Change the button state and styling to de-selected.
        this._alertBttnSelected = false;
        this.toggleClass("selected", this._alertBttnSelected, this.querySelector('.customMapBttn'));
        //Revert the cursor state, clear the temporary click listener and reset the selected Alert Template id.
        if (this._selectedAlertTemplateId) {
            //Reset the cursor.
            this._map.setOptions({draggableCursor:''});
            //Remove this click-listener and clear the selected Alert Template id.
            google.maps.event.clearListeners(this._map,'click');
            this._selectedAlertTemplateId = null;
        }
    },

    /**
     * Returns the tracker label or the _id.
     * @param alertTemplate
     * @private
     */
    _getAlertTemplateName: function(alertTemplate) {
        return alertTemplate.label || alertTemplate._id;
    },

    /**
     * Fired when an Alert Template is selected.
     * @private
     */
    _selectAlertTemplate: function(e) {
        var _this = this;
        //Store the id of the selected Alert Template for later use.
        this._selectedAlertTemplateId = e.target.getAttribute('data-id');
        //Change the cursor to the icon of the Alert Template (17.5/35 offset so the click registers in the correct position)
        this._map.setOptions({draggableCursor:'url('+this.pathtoimages+'/img/alert_marker.png) 17.5 35, crosshair'});

        google.maps.event.addListener(this._map,'click',function(e) {
            //Create a new child Alert Template to be linked one-to-one with the Alert.
            _this._createChildTemplate(_this._selectedAlertTemplateId,e.latLng);
        })
    },

    /**
     *
     * @param parentAlertTemplateId
     * @param latLng
     * @private
     */
    _createChildTemplate: function(parentAlertTemplateId,latLng) {
        //Find and clone the Alert Template that we will build the child template from.
        var childTemplate = JSON.parse(JSON.stringify(this._alertTemplates.filter(function(alertTemplate) {
            return alertTemplate._id === parentAlertTemplateId;
        })[0]));
        //Update the coordinates for the anchor point and zone centers.
        childTemplate.anchor.geometry.coordinates = [latLng.lng(),latLng.lat()];
        for (var i=0; i<childTemplate.zones.features.length; i++) {
            childTemplate.zones.features[i].properties.googleMaps.center = [latLng.lat(),latLng.lng()];
        }
        //Create a new _id and add the parentAlertTemplateId to the properties.
        if (!childTemplate.properties) {
            childTemplate.properties = {};
        }
        childTemplate.properties.parentTrackerId = childTemplate._id;
        childTemplate._id = parentAlertTemplateId+'.'+new Date().getTime();
        //Now that we have updated center coordinates we need to update the coordinates for all the zones.
        this._alertTemplateData = {"alertTemplate":childTemplate,"marker":null,"circles":[],"zoneOverlays":[],"highestLats":[],"isPersisted":false};
        this._updateAlertTemplateJSON();
        //Draw the new Alert Template.
        this._drawAlertTemplate(this._alertTemplateData.alertTemplate);
        //De-activate the Alert button.
        this._deSelectAlertBttn();
    },

    /**
     * Toggles activation mode for the Alert.
     * @param e
     * @private
     */
    _toggleActivatingAlert: function(e) {
        //In case there were changes, update the child Alert Template.
        this.saveAlertTemplate();
        //Enable "Confirm New Alert" Mode.
        this._activatingAlert = true;
    },

    /**
     * Activates the current Alert.
     * @param e
     * @private
     */
    _activateAlert: function(e) {
        var _this = this;
        //Create the new Alert location.
        var location = {
            "location": {
                "geometry": { "type" : "Point", "coordinates" : this._alertTemplateData.alertTemplate.anchor.geometry.coordinates },
                "properties": {
                    "trackerId": this._alertTemplateData.alertTemplate._id,
                    "zoneNamespace": new Date().getTime()
                }
            }
        };
        voyent.locate.updateTrackerLocation({location: location}).then(function(data) {
            _this._alertTemplateData.alertInstance = location;
        }).catch(function (error) {
            _this.fire('message-error', 'Issue creating new Alert: ' + location.location.properties.zoneNamespace);
            console.error('Issue creating new Alert: ' + location.location.properties.zoneNamespace, error);
        });
    },

    /**
     * Handles all back functionality in the editor.
     * @param e
     * @private
     */
    _goBack: function(e) {
        if (this._activatingAlert) {
            this._activatingAlert = false;
        }
        else {
            this.removeAlertTemplate();
        }
    },

    /**
     * Cancels the entire Alert creation process and deletes and child Alert Templates that may have been created.
     * @param e
     * @private
     */
    _cancel: function(e) {
        this.removeAlertTemplate();
        this._addAlertButton();
    },

    /**
     * Initialize a keydown listener for canceling Alert creation.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        //If the escape key is pressed then stop drawing
        //and cancel any polygons currently being drawn.
        window.addEventListener('keydown',function (event) {
            if (event.which === 27) {
                _this._deSelectAlertBttn();
            }
        });
    },

    /**
     * Validates the new attribute value and fires the `pathtoimagesChanged` event.
     * @param newVal
     * @param oldVal
     * @private
     */
    _pathtoimagesChanged: function(newVal, oldVal) {
        if (newVal.charAt[newVal.length-1] === '/') {
            this.path = newVal.slice(0,-1);
            return;
        }
        this.fire('pathtoimagesChanged',{'path':newVal});
    }
});
