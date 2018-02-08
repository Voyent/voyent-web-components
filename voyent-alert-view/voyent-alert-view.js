Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],


    properties: {
        /**
         * Indicates which mode the component is in. Valid values are `notification`, `view` and `preview`.
         */
        mode: { type: String, observer: '_modeChanged' },
        /**
         * Indicates whether the component is loaded on mobile.
         */
        isMobile: { type: Boolean, value: false },
        /**
         * Indicates whether the component is in portrait mode. Applicable only when isMobile is true.
         */
        isPortrait: { type: Boolean, value: false, observer: '_isPortraitChanged' }

    },

    ready: function() {
        this._loadedAlert = null;
        this._myLocations = [];
    },
    
    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._fetchRealmRegion();
    },

    /**
     * View the alert associated with the templateId at its last known location.
     * If location records are included they will be drawn on the map.
     * @param templateId - The id of the alert template to be drawn.
     * @param locations - An optional array of location records to be drawn.
     */
    viewAlert: function(templateId,locations) {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided');
                return;
            }
            _this.clearMap();
            //Fetch the alert and user locations.
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            Promise.all(promises).then(function(results) {
                var alert = results[0];
                var location = results[1];
                //First clear the map if we have an alert loaded already.
                if (_this._loadedAlert) {
                    _this.clearMap();
                }
                //Build our LatLng object using the coordinates of the last location of the alert.
                var latLng = null;
                if (alert.geo) {
                    latLng = new google.maps.LatLng(
                        location.location.geometry.coordinates[1],
                        location.location.geometry.coordinates[0]
                    );
                }
                _this._drawAndLoadAlertTemplate(alert,latLng);
                _this._drawLocations(locations,true);
                _this._templateId = _this._loadedAlert.template.id;
                _this._toggleEditableMap(_this.mode === 'view');
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * Loads the passed template into the view and optionally renders only the specified zone.
     * @param template
     * @param zoneId
     * @param locations
     */
    previewZoneFromTemplate: function(template,zoneId,locations) {
        if (!template || typeof template !== 'object') {
            this.fire('message-error','Unable to load template, template not provided');
            return;
        }
        //Ensure that the passed zoneId is valid. If not we will fallback to just drawing the inner zone of each stack.
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        if (zoneId) {
            if (zoneId === this._FALLBACK_ZONE_ID && template.properties[this._FALLBACK_ZONE_ID].enabled) {
                //Ensure we don't zoom in to for when panning the map on a location inside the fallback zone.
                this._map.setOptions({maxZoom:16});
                this._zoneIdToDisplay = this._FALLBACK_ZONE_ID;
            }
            else {
                for (var i=0; i<template.geo.geometries.length; i++) {
                    if (zoneId === template.geo.geometries[i].id) {
                        this._zoneIdToDisplay = zoneId;
                        break;
                    }
                }
            }
        }
        this.clearMap();
        this._drawLocations(locations,false);
        this._drawAndLoadAlertTemplate(template);
        this._map.setOptions({maxZoom:null});
    },

    /**
     * Fetches the latest location of the current user and refreshes their position on the map.
     */
    refreshUserLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            _this._fetchLocationRecord().then(_this._adjustBoundsAndPan.bind(_this)).catch(function(error) {
                _this.fire('message-error', 'Issue drawing user\'s location: ' +
                                             (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Fetches the latest location of the currently loaded alert and refreshes the position on the map.
     */
    refreshAlertLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            if (!_this._templateId) { return; }
            _this._fetchLocationRecord(_this._templateId).then(function(location) {
                //Update the template coordinates, the label's position and adjust the bounds.
                var pos = new google.maps.LatLng(location.location.geometry.coordinates[1],location.location.geometry.coordinates[0]);
                if (_this._loadedAlert.template.marker) {
                    _this._loadedAlert.template.calculateRelativeStackPositions(_this._loadedAlert.template.marker.getPosition());
                    _this._loadedAlert.template.marker.setPosition(pos);
                }
                else if (_this._loadedAlert.template.zoneStacks.length && _this._loadedAlert.template.zoneStacks[0].marker) {
                    _this._loadedAlert.template.calculateRelativeStackPositions(_this._loadedAlert.template.zoneStacks[0].marker.getPosition());
                }
                else { return; }
                _this._loadedAlert.template.moveStacksRelativeToPosition(pos);
                // Don't adjust the map in view mode as the user may be panning the map.
                if (!_this.mode !== 'view') {
                    _this._adjustBoundsAndPan();
                }
            }).catch(function(error) {
                _this.fire('message-error', 'Issue refreshing the alert\'s location: ' +
                           (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Returns the center point of the alert.
     * @returns {lat: Number, lng: Number}
     */
    getAlertCenter: function() {
        if (!this._loadedAlert || !this._loadedAlert.template) { return; }
        if (this._loadedAlert.template.marker) {
            return this._loadedAlert.template.marker.getPosition().toJSON();
        }
        else if (this._loadedAlert.template.zoneStacks.length && this._loadedAlert.template.zoneStacks[0].marker) {
            return this._loadedAlert.template.zoneStacks[0].marker.getPosition().toJSON();
        }
    },

    //******************PRIVATE API******************

    /**
     * Draws a user marker on the map based on the passed location data.
     * @param location
     * @private
     */
    _drawUser: function(location) {
        if (!location) { return; }
        var coordinates = location.location ? location.location.geometry.coordinates : location.geometry.coordinates;
        //Check if we already have a user location drawn on the map.
        if (this._userLocationMarker) { //Update the existing instance.
            this._userLocationMarker.setPosition(new google.maps.LatLng(coordinates[1],coordinates[0]));
        }
        else {
            this._userLocationMarker = new google.maps.Marker({
                position: new google.maps.LatLng(coordinates[1],coordinates[0]),
                map: this._map,
                draggable: false,
                icon: this.pathtoimages+'/img/user_marker.png'
            });
        }
    },

    /**
     * Draws user markers on the map based on the passed location data.
     * @param locations
     * @param useMarkerIcon
     * @private
     */
    _drawLocations: function(locations,useMarkerIcon) {
        if (!locations) { return; }
        this._myLocations = [];
        for (var i=0; i<locations.length; i++) {
            //We should always only have one mobile location.
            if (locations[i].properties.vras.type === 'mobile') {
                this._drawUser(locations[i]);
                continue;
            }
            this._myLocations.push(new this._MyLocation(
                locations[i].properties.vras.id,
                locations[i].properties.vras.name,
                locations[i].properties.vras.type === 'residential',
                new google.maps.Marker({
                    position: new google.maps.LatLng(
                        locations[i].geometry.coordinates[1],locations[i].geometry.coordinates[0]
                    ),
                    map: this._map,
                    draggable: false,
                    icon: useMarkerIcon ? this._MY_LOCATION_ICON_INACTIVE : this.pathtoimages+'/img/user_marker.png'
                }),
                null
            ));
        }
    },

    /**
     * Adds the fullscreen custom control to the map.
     * @private
     */
    _addFullscreenControl: function() {
        if (this._fullscreenControlAdded) { return; }
        this._isFullscreenMode = false;
        this.$.fullscreenBttn.removeAttribute('hidden');
        this._map.controls[google.maps.ControlPosition.RIGHT_TOP].push(this.$.fullscreenBttn);
        this.$.fullscreenBttn.onclick = this._toggleFullscreenDialog.bind(this);
        this._fullscreenControlAdded = true;
    },

    /**
     * Toggles the modal fullscreen dialog.
     * @private
     */
    _toggleFullscreenDialog: function() {
        // Open or close the dialog depending on the current state
        if (this._isFullscreenMode) {
            this._closeFullscreenDialog();
        }
        else {
            this._openFullscreenDialog();
        }
        this._isFullscreenMode = !this._isFullscreenMode;
        // Toggle the editable features of the map
        this._toggleEditableMap(this._isFullscreenMode);
    },

    /**
     * Opens the fullscreen modal dialog.
     * @private
     */
    _openFullscreenDialog: function() {
        var _this = this;
        var dialog = this.querySelector('#fullscreenDialog');
        if (dialog) {
            // Open the dialog
            dialog.open();
            // Save the current map width before moving it into the dialog container
            var mapDiv = _this._map.getDiv();
            if (this.width) {
                this._beforeDialogWidth = this.width;
                this.width = null;
            }
            // Move the map to the dialog container, adjust the size and add the esc key listener
            this.$.dialogContainer.append(mapDiv);
            this.resizeMap();
            this._addKeydownListener();
        }
    },

    /**
     * Closes the fullscreen modal dialog.
     * @private
     */
    _closeFullscreenDialog: function() {
        // Restore the original map width before moving it to the inline container
        if (this._beforeDialogWidth) {
            this.width = this._beforeDialogWidth;
        }
        // Move the map to the inline container, adjust the size and remove the esc key listener
        var mapDiv = this._map.getDiv();
        this.$.container.append(mapDiv);
        this.resizeMap();
        this._removeKeydownListener();
        // Close the dialog
        this.querySelector('#fullscreenDialog').close();
    },

    /**
     * Toggle map panning, zooming and dragging.
     * @param editable
     * @private
     */
    _toggleEditableMap: function(editable) {
        this._map.setOptions({mapTypeControl:editable,zoomControl:editable,draggable:editable,disableDoubleClickZoom:!editable});
        if (editable) {
            this._adjustBoundsAndPan();
        }
    },

    /**
     * Adds a keydown listener on desktop that exits fullscreen mode when the esc key is pressed.
     * @private
     */
    _addKeydownListener: function() {
        if (this.isMobile) { return; }
        var _this = this;
        this._dialogKeyListener = function(e) {
            if (e.which === 27) {
                _this._toggleFullscreenDialog();
            }
        };
        window.addEventListener('keydown',this._dialogKeyListener);
    },

    /**
     * Removes the keydown listener on desktop that exits fullscreen mode when the esc key is pressed.
     * @private
     */
    _removeKeydownListener: function() {
        if (this.isMobile) { return; }
        window.removeEventListener('keydown',this._dialogKeyListener);
    },

    /**
     * Monitors the `mode` property and handles adding the fullscreen control to the map on changes.
     * @param mode
     * @private
     */
    _modeChanged: function(mode) {
        if (mode && mode === 'notification') {
            this._addFullscreenControl();
        }
    },

    /**
     * Monitors the `portrait` property and hides and shows the fullscreen modal dialog if it is
     * currently visible. This ensures that the styling will be correct when the orientation changes.
     * @private
     */
    _isPortraitChanged: function() {
        var _this = this;
        if (this.isMobile && this._isFullscreenMode) {
            this._toggleFullscreenDialog();
            setTimeout(function() {
                _this._toggleFullscreenDialog();
                _this.resizeMap();
            },0);
        }
    }
});
