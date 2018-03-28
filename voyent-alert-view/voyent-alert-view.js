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
        this.set('_myLocations',[]);
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
        //Always start the view with a windowed component.
        if (this._isFullscreenMode) {
            this._toggleFullscreenContainer();
        }
        this._mapIsReady().then(function() {
            if (!templateId || typeof templateId !== 'string') {
                _this.fire('message-error','Unable to load template, id not provided');
                return;
            }
            _this.clearMap();
            //Fetch the alert template, its current location and the user locations (incl. mobile).
            var promises = [];
            promises.push(_this._fetchAlertTemplate(templateId));
            promises.push(_this._fetchLocationRecord(templateId));
            if (_this.mode === 'notification') {
                //First create a list of affected location ids. We will draw all locations but
                //will use this list to ensure we only pan the map on the affected locations.
                _this._affectedLocationIds = [];
                //Then create a list of affected stack ids. These are the zone stacks which have locations inside
                //of them. We will use this list to ensure we only draw alert stacks that contain affected locations.
                _this._affectedStackIds = [];
                if (locations && locations.length) {
                    _this._affectedLocationIds = locations.map(function(obj) {
                        return obj.properties.vras.id;
                    });
                    _this._affectedStackIds = locations.map(function(obj) {
                        //We will get undefined values here for locations inside fallback zone, this is expected.
                        return obj.properties.vras.insideStackId;
                    });
                }
                promises.push(_this._fetchLocationRecord());
                promises.push(_this._fetchMyLocations());
            }
            Promise.all(promises).then(function(results) {
                var alert = results[0];
                var alertLocation = results[1];
                var userLocation = results[2];
                var myLocations = results[3];
                //Add the mobile location to our list of locations so it also gets drawn.
                if (userLocation) {
                    myLocations.push(userLocation.location);
                }
                //First clear the map if we have an alert loaded already.
                if (_this._loadedAlert) {
                    _this.clearMap();
                }
                //Build our LatLng object using the coordinates of the last location of the alert.
                var latLng = null;
                if (alert.geo) {
                    latLng = new google.maps.LatLng(
                        alertLocation.location.geometry.coordinates[1],
                        alertLocation.location.geometry.coordinates[0]
                    );
                }
                _this._drawAndLoadAlertTemplate(alert,latLng);
                _this._drawLocations(myLocations);
                _this._templateId = _this._loadedAlert.template.id;
                _this._toggleEditableMap(_this.mode === 'view');
                if (_this.mode === 'notification') {
                    setTimeout(function() {
                        _this._adjustBoundsAndPan();
                    },0);
                }
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
        this._drawLocations(locations);
        this._drawAndLoadAlertTemplate(template);
        this._map.setOptions({maxZoom:null});
    },

    /**
     * Fetches the latest location of the current user and refreshes their position on the map.
     */
    refreshUserLocation: function() {
        var _this = this;
        this._mapIsReady().then(function() {
            _this._fetchLocationRecord().then(function(location) {
                _this._drawUser(location);
                _this._adjustBoundsAndPan();
            }).catch(function(error) {
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
        location = location.location || location;
        //Check if we already have a user location drawn on the map.
        if (this._mobileLocation) { //Update the existing instance.
            this._mobileLocation.marker.setPosition(new google.maps.LatLng(location.geometry.coordinates[1],location.geometry.coordinates[0]));
        }
        else {
            this._mobileLocation = new this._MyLocation(
                location.properties.vras.id,
                null, //No name so the label doesn't render.
                location.properties.vras.type === 'residential',
                new google.maps.Marker({
                    position: new google.maps.LatLng(location.geometry.coordinates[1],location.geometry.coordinates[0]),
                    map: this._map,
                    draggable: false,
                    icon: this.pathtoimages+'/img/user_marker.png'
                })
            );
            //Add click listener to the marker so the user can click anywhere on the map to enable fullscreen.
            this._addFullscreenClickListener(this._mobileLocation.marker);
        }
    },

    /**
     * Draws user markers on the map based on the passed location data.
     * @param locations
     * @private
     */
    _drawLocations: function(locations) {
        if (!locations || !locations.length) { return; }
        this.set('_myLocations',[]);
        for (var i=0; i<locations.length; i++) {
            // For notification and view modes we want to render the user icon for the mobile location.
            if (this.mode !== 'preview' && locations[i].properties.vras.type === 'mobile') {
                this._drawUser(locations[i]);
                continue;
            }
            var marker = new google.maps.Marker({
                position: new google.maps.LatLng(
                    locations[i].geometry.coordinates[1],locations[i].geometry.coordinates[0]
                ),
                map: this._map,
                draggable: false,
                icon: this.mode !== 'preview' ? this._MY_LOCATION_ICON_INACTIVE : this._getIconByEndpointType(locations[i].endpointType)
            });
            //Add click listener to the marker so the user can click anywhere on the map to enable fullscreen.
            this._addFullscreenClickListener(marker);
            this.push('_myLocations',new this._MyLocation(
                locations[i].properties.vras.id,
                locations[i].properties.vras.name,
                locations[i].properties.vras.type === 'residential',
                marker
            ));
        }
    },

    /**
     * Returns the location marker image to use based on the passed endpoint type.
     * @param endpointType
     * @returns {string}
     * @private
     */
    _getIconByEndpointType: function(endpointType) {
        if (endpointType === 'fcm') {
            return this.pathtoimages+'/img/android_triangle.png';
        }
        else if (endpointType === 'apns') {
            return this.pathtoimages+'/img/ios_triangle.png';
        }
        else if (endpointType === 'mailto') {
            return this.pathtoimages+'/img/email_square.png';
        }
        else if (endpointType === 'sms') {
            return this.pathtoimages+'/img/sms_circle.png';
        }
        else if (endpointType === 'voice') {
            return this.pathtoimages+'/img/voice_donut.png';
        }
        return this.pathtoimages+'/img/user_marker.png';
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
     * Monitors the `mode` property and handles adding the fullscreen control to the map on changes.
     * @param mode
     * @private
     */
    _modeChanged: function(mode) {
        if (mode && mode === 'notification' || mode === 'preview') {
            this._addFullscreenControl();
        }
    },

    /**
     * Monitors the `isPortrait` property and hides and shows the fullscreen modal dialog if it is
     * currently visible. This ensures that the styling will be correct when the orientation changes.
     * @private
     */
    _isPortraitChanged: function() {
        var _this = this;
        if (this.isMobile && this._isFullscreenMode) {
            this._toggleFullscreenContainer();
            setTimeout(function() {
                _this._toggleFullscreenContainer();
                _this.resizeMap();
            },400);
        }
    }
});
