Polymer({
    is: 'voyent-alert-view',
    behaviors: [Voyent.AlertMapBehaviour,Voyent.AlertBehaviour],


    properties: {
        /**
         * Indicates which mode the component is in. Valid values are `notification`, `view`, `preview`, and `response`.
         */
        mode: { type: String },
        /**
         * Indicates whether the component is loaded on mobile.
         */
        isMobile: { type: Boolean, value: false },
        /**
         * Indicates whether the component is in portrait mode. Applicable only when isMobile is true.
         */
        isPortrait: { type: Boolean, value: false, observer: '_isPortraitChanged' }

    },

    observers: [
        '_alertHistoryChanged(_alertHistory)',
        '_notificationFilterChanged(_notificationFilter)',
        '_mobileLocationEnabledChanged(_mobileLocationEnabled)'
    ],

    ready: function() {
        this._loadedAlert = null;
        this.set('_myLocations',[]);
        this._LOCATION_TYPE_COUNT_LEGEND_ID = 'locationTypesCount';
        this._LOCATION_TYPE_STATE_LEGEND_ID = 'locationTypesState';
        this._CURRENT_LOCATION_BUTTON_ID = 'currentLocationButton';
        this._addNativeAppStateListeners();
    },

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        var _this = this;
        this._fetchRealmRegion();
        // Add fullscreen control + esc listener
        this._addFullscreenButton();
        // Add current location button for notification detail view
        this._addMobileLocationButton();
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _this._isFullscreenMode) {
                _this._toggleFullscreenContainer(true);
            }
        });
    },

    /**
     * View the alert associated with the templateId at its last known location.
     * If location records are included they will be drawn on the map.
     * @param templateId - The id of the alert template to be drawn.
     * @param affectedLocations - A list of affected locations.
     */
    viewAlertDetail: function(templateId,affectedLocations) {
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
            promises.push(_this._fetchMyLocations());
            //First create a list of affected location ids. We will draw all locations but
            //will use this list to ensure we only pan the map on the affected locations.
            _this._affectedLocationIds = [];
            //Then create a list of affected stack ids. These are the zone stacks which have locations inside one
            //of their zones. We will use this list to help determine how the map should be panned. If there
            //are no affected stack ids then it means the notification was triggered by a fallback zone.
            _this._affectedStackIds = [];
            if (affectedLocations && affectedLocations.length) {
                _this._affectedLocationIds = affectedLocations.map(function(obj) {
                    return obj.properties.vras.id;
                });
                _this._affectedStackIds = affectedLocations.reduce(function(result, obj) {
                    if (typeof obj.properties.vras.insideStackId !== 'undefined') {
                        result.push(obj.properties.vras.insideStackId);
                    }
                    return result;
                }, []);
                // We draw all "my locations" but to get the affected
                // mobile location we must grab it from passed data
                var mobileLocation;
                for (var i=0; i<affectedLocations.length; i++) {
                    if (affectedLocations[i].properties.vras.type === 'mobile') {
                        mobileLocation = affectedLocations[i];
                        break;
                    }
                }
            }
            Promise.all(promises).then(function(results) {
                var alert = results[0];
                var alertLocation = results[1];
                var myLocations = results[2];
                //Add the mobile location to our list of locations so it also gets drawn.
                if (mobileLocation) {
                    myLocations.push(mobileLocation);
                }
                //First clear the map if we have an alert loaded already.
                if (_this._loadedAlert) {
                    _this.clearMap();
                }
                if (alert) {
                    //Build our LatLng object using the coordinates of the last location of the alert.
                    var latLng = null;
                    if (alert.geo) {
                        latLng = new google.maps.LatLng(
                            alertLocation.location.geometry.coordinates[1],
                            alertLocation.location.geometry.coordinates[0]
                        );
                    }
                    _this._drawAndLoadAlertTemplate(alert,latLng);
                    _this._templateId = _this._loadedAlert.template.id;
                }
                else {
                    _this.fire('message-info','Unable to find alert geography');
                }
                _this._drawLocations(myLocations);
                _this._toggleEditableMap(false);
                setTimeout(function() {
                    _this._adjustBoundsAndPan();
                },0);
            }).catch(function(error) {
                console.error(error);
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * View the alert associated with the templateId at its last known location.
     * If location records are included they will be drawn on the map.
     * @param alert - The alert template to be drawn.
     * @param locations - An optional array of location records to be drawn.
     * @param alertHistory - The notification history of the alert.
     */
    viewAlert: function(alert,locations,alertHistory) {
        var _this = this;
        //Always start the view with a windowed component.
        if (this._isFullscreenMode) {
            this._toggleFullscreenContainer();
        }
        // Reset some state
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        // Wait for map before proceeding
        this._mapIsReady().then(function() {
            if (!alert || typeof alert !== 'object') {
                _this.fire('message-error','Unable to load template, template not provided.');
                return;
            }
            _this.clearMap();
            //Fetch the alert template, its current location and the user locations (incl. mobile).
            _this._fetchLocationRecord(alert._id).then(function(alertLocation) {
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
                _this._templateId = _this._loadedAlert.template.id;
                // Draw the locations and ensure the map can be panned
                _this._drawLocations(locations);
                _this._toggleEditableMap(true);
                // Set the location types legend history
                _this.set('_alertHistory',alertHistory);
            }).catch(function(error) {
                console.error(error);
                _this.fire('message-error', 'Issue refreshing the view: ' + (error.responseText || error.message || error));
            });
            //Reset the templateId as we'll re-set it later when we're ready.
            _this._templateId = null;
        });
    },

    /**
     * Loads the passed template into the view and optionally renders only the specified zone.
     * @param template - The template JSON.
     * @param zoneId - The (optional) zone id that will be rendered rather than every zone.
     * @param locations - An array of locations to be drawn.
     * @param alertHistory - The notification history for the zone, this OR notificationFilter should be provided.
     * @param notificationFilter - The notification filter settings for the zone, this OR notificationFilter should be provided.
     */
    previewZoneFromTemplate: function(template,zoneId,locations,alertHistory,notificationFilter) {
        if (!template || typeof template !== 'object') {
            this.fire('message-error','Unable to load template, template not provided');
            return;
        }
        // Ensure that the passed zoneId is valid. If not we will fallback to just drawing the inner zone of each stack.
        this._zoneIdToDisplay = null;
        this._foundZoneIdMatch = false;
        if (zoneId) {
            if (zoneId === this._FALLBACK_ZONE_ID && template.properties[this._FALLBACK_ZONE_ID].enabled) {
                // Ensure we don't zoom in too far when panning the map on a location inside the fallback zone.
                this._map.setOptions({maxZoom:this._maxZoom});
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
        // Draw the alert
        this.clearMap();
        this._drawLocations(locations, (alertHistory ? alertHistory : null));
        this._drawAndLoadAlertTemplate(template);
        this._map.setOptions({maxZoom:null});
        // Set the location types legend history and notification filter
        this.set('_alertHistory',alertHistory);
        this.set('_notificationFilter',notificationFilter);
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
                if (!_this.mode !== 'view' && !_this.mode !== 'response') {
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

    /**
     * Toggles visibility of locations based on the provided location type.
     * @param locationType
     * @param visible
     */
    toggleLocationsForType: function(locationType,visible) {
        if (!this._myLocations || !this._myLocations.length) {
            return;
        }
        for (var i=0; i<this._myLocations.length; i++) {
            if (this._myLocations[i].type === locationType) {
                if (visible) {
                    this._myLocations[i].removeFromMap();
                }
                else {
                    this._myLocations[i].addToMap();
                }
            }
        }
    },

    /**
     * Toggles visibility of locations based on the provided endpoint type.
     * @param endpointType
     * @param visible
     */
    toggleLocationsForEndpoint: function(endpointType,visible) {
        if (!this._myLocations || !this._myLocations.length) {
            return;
        }
        for (var i=0; i<this._myLocations.length; i++) {
            if (this._myLocations[i].endpointType === endpointType) {
                if (visible) {
                    this._myLocations[i].removeFromMap();
                }
                else {
                    this._myLocations[i].addToMap();
                }
            }
        }
    },

    //******************PRIVATE API******************

    /**
     * Draws a user marker on the map based on the passed location data.
     * @param location
     * @private
     */
    _drawAffectedMobileLocation: function(location) {
        if (!location) { return; }
        location = location.location || location;
        //Check if we already have a user location drawn on the map.
        if (this._affectedMobileLocation) { //Update the existing instance.
            this._affectedMobileLocation.marker.setPosition(new google.maps.LatLng(location.geometry.coordinates[1],location.geometry.coordinates[0]));
        }
        else {
            this._affectedMobileLocation = new this._MyLocation(
                location.properties.vras.id,
                null, //No name so the label doesn't render.
                location.properties.vras.type,
                new google.maps.Marker({
                    position: new google.maps.LatLng(location.geometry.coordinates[1],location.geometry.coordinates[0]),
                    map: this._map,
                    draggable: false,
                    icon: this.pathtoimages+'/img/user_marker.png'
                })
            );
            //Add click listener to the marker so the user can click anywhere on the map to enable fullscreen.
            this._addFullscreenClickListener(this._affectedMobileLocation.marker);
        }
    },

    /**
     * Draws a mobile location marker on the map based on the passed coordinates.
     * @param lat
     * @param lng
     * @private
     */
    _drawMobileLocation: function(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            return;
        }
        //Check if we already have a user location drawn on the map.
        if (this._mobileLocation) { //Update the existing instance.
            this._mobileLocation.marker.setPosition(new google.maps.LatLng(lat, lng));
        }
        else {
            this._mobileLocation = new this._MyLocation(
                null, null, 'mobile',
                new google.maps.Marker({
                    position: new google.maps.LatLng(lat,lng),
                    map: this._map,
                    draggable: false,
                    icon: this.pathtoimages+'/img/gps.png'
                })
            );
            //Add click listener to the marker so the user can click anywhere on the map to enable fullscreen.
            this._addFullscreenClickListener(this._mobileLocation.marker);
        }
    },

    /**
     * Draws user markers on the map based on the passed location data.
     * @param locations
     * @param alertHistory (optional)
     * @private
     */
    _drawLocations: function(locations, alertHistory) {
        if (!locations || !locations.length) { return; }
        this.set('_myLocations',[]);
        for (var i=0; i<locations.length; i++) {
            if (locations[i] && locations[i].properties && locations[i].geometry) { // Ensure we have a valid location
                // For notification view we want to render the user icon for the affected mobile location.
                if (this.mode === 'notification' && locations[i].properties.vras.type === 'mobile') {
                    this._drawAffectedMobileLocation(locations[i]);
                    continue;
                }
                
                var ourLocation = locations[i];
                var marker = new google.maps.Marker({
                    position: new google.maps.LatLng(
                        ourLocation.geometry.coordinates[1], ourLocation.geometry.coordinates[0]
                    ),
                    map: this._map,
                    draggable: false,
                });
                
                // Handle the marker icon and click listener a bit differently based on the view mode we're in
                // If we're looking at responses we want to use colored icons and add a popup with user details on click
                if (alertHistory && this.nodeName === 'VOYENT-ALERT-VIEW' && this.mode === 'response') {
                    if (alertHistory.users && alertHistory.users[i]) {
                        // Check if we have a location from the user and prioritize that
                        if (alertHistory.users[i].location) {
                            ourLocation = alertHistory.users[i].location;
                            
                            marker.setPosition(new google.maps.LatLng(ourLocation.geometry.coordinates[1],
                                                                      ourLocation.geometry.coordinates[0]));
                        }
                        
                        var ourAnswer = 'No Response';
                        if (alertHistory.acknowledgement && alertHistory.users[i].response && alertHistory.users[i].response.answerId) {
                            // Choose our color based on the answer
                            // Available icons from https://sites.google.com/site/gmapsdevelopment/
                            // Colors: blue, yellow, green, lightblue, orange, pink, purple, red
                            for (var answerLoop = 0; answerLoop < alertHistory.acknowledgement.answers.length; answerLoop++) {
                                if (alertHistory.acknowledgement.answers[answerLoop].id ===
                                     alertHistory.users[i].response.answerId) {
                                    marker.setIcon({ url: "https://maps.google.com/mapfiles/ms/icons/" + (alertHistory.acknowledgement.answers[answerLoop].color ? alertHistory.acknowledgement.answers[answerLoop].color : 'orange') + ".png" });
                                    
                                    ourAnswer = alertHistory.acknowledgement.answers[answerLoop].text;
                                    break;
                                }
                            }
                        }
                        else {
                            // Otherwise with no response default to the no response icon
                            marker.setIcon({ url: "https://maps.google.com/mapfiles/ms/icons/red.png" });
                        }
                        
                        this._addUserDetailsClickListener(marker, alertHistory.users[i], ourAnswer);
                    }
                    else {
                        // Default marker if we don't have user info
                        marker.setIcon({ url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png" });
                        
                        this._addUserDetailsClickListener(marker); // Will at least be clickable and show no details
                    }
                }
                // Otherwise we want to add a full screen click listener
                else {
                    marker.setIcon((this.mode === 'notification' ? this._MY_LOCATION_ICON_INACTIVE : this._getIconByLocationType(ourLocation.properties.vras.type)));
                    
                    this._addFullscreenClickListener(marker);
                }
                
                // Store our drawn location
                this.push('_myLocations',new this._MyLocation(
                    ourLocation.properties.vras.id,
                    ourLocation.properties.vras.name,
                    ourLocation.properties.vras.type,
                    marker,
                    ourLocation.endpointType || null
                ));
            }
        }
    },
    
    applyResponseFilter: function(filter) {
        var filteredUsers = [];
        
        // Filter the map markers and hide as needed
        if (this._alertHistory && this._alertHistory.users && this._alertHistory.users.length > 0 && filter) {
            // First determine if the user has checked NO_RESPONSE, which we'll use later
            var selectedNoResponse = false;
            for (var checkLoop = 0; checkLoop < filter.length; checkLoop++) {
                if (filter[checkLoop].filter === 'NO_RESPONSE') {
                    selectedNoResponse = true;
                    break;
                }
            }
            
            // Now loop through our users and determine if their marker should be shown or not based on the filter
            for (var userLoop = 0; userLoop < this._alertHistory.users.length; userLoop++) {
                if (this._alertHistory.users[userLoop].response) {
                    // Figure out if the user passes the filter or not
                    var hideMarker = true;
                    for (var filterLoop = 0; filterLoop < filter.length; filterLoop++) {
                        if (typeof filter[filterLoop].filter.id !== 'undefined' &&
                            filter[filterLoop].filter.id === this._alertHistory.users[userLoop].response.answerId) {
                            hideMarker = false;
                            break;
                        }
                    }
                    
                    // Then figure out which location the user has, and hide/show the marker as required
                    for (var locLoop = 0; locLoop < this._myLocations.length; locLoop++) {
                        if (this._myLocations[locLoop].id === this._alertHistory.users[userLoop].location.properties.vras.id) {
                            if (hideMarker) {
                                this._myLocations[locLoop].removeFromMap();
                            }
                            else {
                                filteredUsers.push(this._alertHistory.users[userLoop]);
                                this._myLocations[locLoop].addToMap();
                            }
                            
                            break;
                        }
                    }
                }
                // If we don't have a user response still consider the chance we want to see that marker
                else {
                    for (var locLoop = 0; locLoop < this._myLocations.length; locLoop++) {
                        if (this._myLocations[locLoop].id === this._alertHistory.users[userLoop].location.properties.vras.id) {
                            if (selectedNoResponse) {
                                filteredUsers.push(this._alertHistory.users[userLoop]);
                                this._myLocations[locLoop].addToMap();
                            }
                            else {
                                this._myLocations[locLoop].removeFromMap();
                            }
                            
                            break;
                        }
                    }
                }
            }
        }
        
        return filteredUsers;
    },

    /**
     * Adds the location types legend (with count) to the map.
     * @private
     */
    _addLocationTypesCountLegend: function() {
        this._addCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Redraws the location types legend (with count) to the map.
     * @private
     */
    _redrawLocationTypesCountLegend: function() {
        this._redrawCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Removes the location types legend (with count) from the map.
     * @private
     */
    _removeLocationTypesCountLegend: function() {
        this._removeCustomControl(this._LOCATION_TYPE_COUNT_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM)
    },

    /**
     * Adds the location types legend (with state) to the map.
     * @private
     */
    _addLocationTypesStateLegend: function() {
        this._addCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Redraws the location types legend (with state) to the map.
     * @private
     */
    _redrawLocationTypesStateLegend: function() {
        this._redrawCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM,null,null);
    },

    /**
     * Removes the location types legend (with state) from the map.
     * @private
     */
    _removeLocationTypesStateLegend: function() {
        this._removeCustomControl(this._LOCATION_TYPE_STATE_LEGEND_ID,google.maps.ControlPosition.RIGHT_BOTTOM)
    },

    /**
     * Adds the GPS/currnet location button to the map.
     * @private
     */
    _addMobileLocationButton: function() {
        var _this = this;
        if (this.mode === 'notification' && typeof vras !== 'undefined') {
            this._addCustomControl(this._CURRENT_LOCATION_BUTTON_ID,google.maps.ControlPosition.RIGHT_BOTTOM,function() {
                _this.set('_mobileLocationEnabled',!_this._mobileLocationEnabled);
                if (_this._mobileLocationEnabled) {
                    // Include the mobile location in the map panning once it's received from the device
                    _this._includeMobileLocationInPanning = true;
                    // Get the location
                    vras.getLocation();
                    // Start polling the location position
                    _this._startMobileLocationPolling();
                }
                else {
                    // Remove the location from the map
                    _this._mobileLocation.removeFromMap();
                    _this._mobileLocation = null;
                    // Stop polling the location position
                    _this._stopMobileLocationPolling();
                    // Pan to the original alert
                    _this._adjustBoundsAndPan(_this._fullscreenEnabledByUser);
                }
            },function() {
                _this._mobileLocationEnabled = false;
                window._this = {
                    returnCurrentLocation: function(lat,lng) {
                        _this._drawMobileLocation(lat, lng);
                        // Pan on the original alert + the mobile location, only do
                        // this when requested so we don't pan the map when polling
                        if (_this._includeMobileLocationInPanning) {
                            _this._adjustBoundsAndPan(_this._fullscreenEnabledByUser);
                            _this._includeMobileLocationInPanning = false;
                        }
                    }
                };
            });
        }
    },

    /**
     * Manages selected styling on the mobile location button.
     * @param enabled
     * @private
     */
    _mobileLocationEnabledChanged: function(enabled) {
        // Select the custom control (+ '_cc')
        var currentLocationButton = this.querySelector('#'+this._CURRENT_LOCATION_BUTTON_ID+'_cc');
        if (currentLocationButton) {
            this.toggleClass('selected', !!enabled, currentLocationButton);
            currentLocationButton.setAttribute('title',enabled ? 'Disable Location Tracking' : 'Enable Location Tracking')
        }
    },

    /**
     * Starts mobile location polling.
     * @private
     */
    _startMobileLocationPolling: function() {
        this._mobileLocationPoller = setInterval(function() {
            vras.getLocation();
        },10000);
    },

    /**
     * Ends mobile location polling.
     * @private
     */
    _stopMobileLocationPolling: function() {
        clearInterval(this._mobileLocationPoller);
        this._mobileLocationPoller = null;
    },

    /**
     * Listeners for native app pause / resume events.
     * @private
     */
    _addNativeAppStateListeners: function() {
        var _this = this;
        window.addEventListener('voyent-pausing-native-app', function() {
            // Don't continue location polling when the app goes in the background (Android seems to do this)
            if (_this._mobileLocation && _this._mobileLocationPoller) {
                _this._stopMobileLocationPolling();
            }
        });
        window.addEventListener('voyent-resuming-native-app', function() {
            // If we have a mobile location then start polling updates for it again
            if (_this._mobileLocation) {
                _this._startMobileLocationPolling();
            }
        });
    },

    /**
     * Returns the location marker image to use based on the passed location type.
     * @param locationType
     * @returns {string}
     * @private
     */
    _getIconByLocationType: function(locationType) {
        if (locationType === 'mobile') {
            return this.pathtoimages+'/img/circle.png';
        }
        else if (locationType === 'residential') {
            return this.pathtoimages+'/img/triangle_up.png';
        }
        return this.pathtoimages+'/img/square.png';
    },

    /**
     * Returns the location marker image to use based on the passed endpoint type.
     * @param endpointType
     * @returns {string}
     * @private
     */
    _getIconByEndpointType: function(endpointType) {
        if (endpointType === 'fcm') {
            return this.pathtoimages+'/img/triangle_down.png';
        }
        else if (endpointType === 'apns') {
            return this.pathtoimages+'/img/triangle_up.png';
        }
        else if (endpointType === 'mailto') {
            return this.pathtoimages+'/img/square.png';
        }
        else if (endpointType === 'sms') {
            return this.pathtoimages+'/img/circle.png';
        }
        return this.pathtoimages+'/img/donut.png';
    },

    /**
     * Toggle map panning, zooming and dragging.
     * @param editable
     * @private
     */
    _toggleEditableMap: function(editable) {
        this._map.setOptions({draggable: editable, disableDoubleClickZoom: !editable});
        var mapTypeControl = this['_' + this._MAP_TYPE_BUTTONS_ID];
        var zoomControl = this['_' + this._ZOOM_BUTTONS_ID];
        if (editable) {
            mapTypeControl.style.display = 'block';
            zoomControl.style.display = 'block';
            this._adjustBoundsAndPan();
        } else {
            mapTypeControl.style.display = 'none';
            zoomControl.style.display = 'none';
        }
    },

    /**
     * Returns a boolean indicating whether the passed `locationType` is enabled for the current notificationFilter.
     * @param locationType
     * @returns {boolean}
     * @private
     */
    _isLocationTypeEnabled: function(locationType) {
        if (this._notificationFilter) {
            var locationTypes = this._notificationFilter.locationTypes || ['all'];
            if (!locationTypes.length) {
                return false;
            }
            else if (locationTypes.indexOf('all') > -1) {
                return true;
            }

            if (locationType === 'mobile' && locationTypes.indexOf('mobile') > -1) {
                return true;
            }
            else if (locationType === 'residential' && locationTypes.indexOf('residential') > -1) {
                return true;
            }
            else if (locationType === 'other' && locationTypes.indexOf('other') > -1) {
                return true;
            }
            return false;
        }
        return true;
    },

    /**
     * Returns either an `enabled` or `disabled` class to be used for the location type state value.
     * @param locationType
     * @returns {string}
     * @private
     */
    _getLocationTypeClass: function(locationType) {
        return this._isLocationTypeEnabled(locationType) ? 'enabled' : 'disabled';
    },

    /**
     * Show an info message to the user when they click on the mobile location type help icon.
     * @private
     */
    _showMobileLocationTypeHelp: function() {
        this.fire('message-info','Mobile locations are not displayed on the map in preview mode because their position cannot be determined until alert activation.');
    },

    /**
     * Monitors the `_alertHistory` property and toggles the visibility of the location types legend (with count).
     * @param alertHistory
     * @private
     */
    _alertHistoryChanged: function() {
        this.handleMapLegend();
    },
    
    /**
     * Determine if we should add, redraw, or remove our map legend
     * If the mode is `response` we will want to remove the legend, otherwise add/redraw
     * This also leverages alertHistory to determine if we have sufficient data to draw the legend
     */
    handleMapLegend: function() {
        if (this._alertHistory && this.mode !== 'response') {
            if (this['_'+this._LOCATION_TYPE_COUNT_LEGEND_ID]) {
                this._redrawLocationTypesCountLegend();
            }
            else {
                this._addLocationTypesCountLegend();
            }
        }
        else {
            this._removeLocationTypesCountLegend();
        }
    },

    /**
     *Monitors the `_notificationFilter` property and toggles the visibility of the location types legend (with state).
     * @param notificationFilter
     * @private
     */
    _notificationFilterChanged: function(notificationFilter) {
        if (notificationFilter) {
            if (this['_'+this._LOCATION_TYPE_STATE_LEGEND_ID]) {
                this._redrawLocationTypesStateLegend();
            }
            else {
                this._addLocationTypesStateLegend();
            }
        }
        else {
            this._removeLocationTypesStateLegend();
        }
    },

    /**
     * Monitors the `isPortrait` property and hides and shows the fullscreen modal dialog if it
     * is currently visible. This ensures that the styling will be correct when the orientation
     * changes.  We will also try to maintain the user-defined map position and zoom level.
     * @private
     */
    _isPortraitChanged: function() {
        var _this = this;
        if (this.isMobile && this._isFullscreenMode) {
            this._mapCenterBeforeOrientationChange = this._map.getCenter();
            this._toggleFullscreenContainer();
            setTimeout(function() {
                _this._toggleFullscreenContainer();
            },400);
        }
    }
});
