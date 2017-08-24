Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    ready: function() {
        //Initialize some vars
        this._creatingNew = this._activatingAlert = false;
        this._parentTemplates = this._alerts = this._selectedAlertTemplateId = null;
        //Add listener to native map button for cancelling creation.
        this._addListenerToStopDrawingBttn();
    },

    /**
     * Fetches the latest Alert templates, Alert instances and last user's location.
     * @private
     */
    refreshMap: function() {
        var _this = this;
        var promises = [];
        promises.push(this.fetchAlertTemplates());
        promises.push(this._executeAggregate(this._lastAlertLocations));
        Promise.all(promises).then(function() {
            //Convert the Alert locations into map entities.
            _this._processAlertLocations();
        }).catch(function(error) {
            _this.fire('message-error', 'Issue initializing Alert Editor: ' + (error.responseText || error.message || error));
        });
        //Fetch the user's last known location.
        this._fetchLocationRecord();
    },

    /**
     * Fetches the latest Alert Templates for the realm.
     * @returns {*}
     * @private
     */
    fetchAlertTemplates: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            voyent.locate.getAllTrackers({realm:_this.realm,account:_this.account}).then(function(templates) {
                //Maintain a list of parent templates.
                _this._parentTemplates = templates.filter(function(alertTemplate) {
                    return !alertTemplate.properties || !alertTemplate.properties.parentTrackerId;
                });
                //Maintain an id-mapped object of all templates, including child templates.
                _this._templatesMap = templates.reduce(function(map,obj) {
                    map[obj._id] = obj;
                    return map;
                },{});
                //Handle adding and removing the button for creating new Alerts depending on whether we have templates.
                if (_this._parentTemplates.length) {
                    _this._addAlertButton();
                }
                else {
                    _this._removeAlertButton();
                }
                resolve();
            }).catch(function (error) {
                reject(error);
            });
        });
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        //Fetch the alert templates, the last alert locations and the last user location.
        this.refreshMap();
        //Fetch the realm region.
        this._fetchRealmRegion();
    },

    /**
     * Combines the Alert location data with Alert template data to produce a map entity.
     * @private
     */
    _processAlertLocations: function() {
        //First clear any existing alerts.
        if (this._alerts) {
            var zones;
            for (var i=0; i<this._alerts.length; i++) {
                //Clear the marker.
                this._alerts[i].marker.setMap(null);
                //Clear the zones
                zones = this._alerts[i].alertTemplate.zones.features;
                for (var j=0; j<zones.length; j++) {
                    zones[j].tmpProperties.circle.setMap(null);
                }
            }
        }
        //Always initialize the array.
        this.set('_alerts',[]);
        //Draw the Alerts if we can find a matching Alert Template.
        for (var k=0; k<this._alertLocations.length; k++) {
            var trackerId = this._alertLocations[k].location.properties ?
                this._alertLocations[k].location.properties.trackerId : null;
            if (!trackerId || !this._templatesMap[trackerId]) {
                continue;
            }
            var alert = JSON.parse(JSON.stringify(this._templatesMap[trackerId]));
            alert.anchor.geometry.coordinates = this._alertLocations[k].location.geometry.coordinates;
            this._drawAlertEntity(alert,this._alertLocations[k]);
        }
    },

    /**
     * Executes aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _executeAggregate: function(query) {
        var _this = this;
        var id = query._id;
        return new Promise(function (resolve, reject) {
            voyent.query.executeQuery({realm:_this.realm,id:id}).then(function(results) {
                _this._alertLocations = results;
                resolve();
            }).catch(function(error) {
                var res = JSON.parse(error.response);
                if (res.status === 404 ||
                    (res.status === 500 && res.code == 'contextNotFound')) {
                    _this._createAggregate(query).then(function() {
                        resolve();
                    }).catch(function(error){reject(error);});
                }
            });
        });
    },

    /**
     * Creates aggregate queries for getting last user and tracker locations.
     * @param query
     * @private
     */
    _createAggregate: function(query) {
        var _this = this;
        var id = query._id;
        return new Promise(function (resolve, reject) {
            voyent.query.createQuery({realm:_this.realm,id:id,query:query}).then(function() {
                _this._executeAggregate(query).then(function() {
                    resolve();
                }).catch(function(error){reject(error);});
            }).catch(function(error) {
                reject(error);
            });
        });
    },

    /**
     * Aggregate query for getting the last locations of all Alerts.
     */
    _lastAlertLocations: {"_id":"_getLastAlertLocations","query":[{"$match":{"_data.location.properties.trackerId":{"$exists":true}}},{"$sort":{"_data.lastUpdated":-1}},{"$group":{"_id":"$_data.username","location":{"$first":"$_data.location"},"lastUpdated":{"$first":"$_data.lastUpdated"}}},{"$project":{"_id":0,"location":1,"username":1,"lastUpdated":1}}],"properties":{"title":"Find Last Tracker Locations","service":"locate","collection":"locations","type":"aggregate"}},

    /**
     * Handles adding the button for creating new Alerts.
     * @private
     */
    _addAlertButton: function() {
        //Only add the button if...
        //...the button isn't already rendered
        //...we have parent templates to build the alert from
        //...we aren't creating or activating a new alert
        //...we don't have a template loaded OR we have a template loaded but the alert instance isn't yet created
        if (!this.querySelector('#alertBttn:not([hidden])') && this._parentTemplates && this._parentTemplates.length &&
            !this._creatingNew && !this._activatingAlert &&
                (!this._loadedAlertTemplateData ||
                    (this._loadedAlertTemplateData && this._loadedAlertTemplateData.alertTemplate &&
                     this._loadedAlertTemplateData.alertInstance)
                )
            ) {
            var _this = this;
            var alertBttn = this.$.alertBttn.cloneNode(true);
            alertBttn.onclick = function() {
                if (!_this._creatingNew) { _this._toggleCreatingAlert(); }
                else { _this._cancel(); }
            };
            this._map.controls[google.maps.ControlPosition.TOP_RIGHT].push(alertBttn);
            //Delay so that the button isn't shown on
            //the page before being moved into the map.
            setTimeout(function () {
                alertBttn.hidden = false;
            },100);
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
            bttn.onclick = _this._cancel.bind(_this);
        }
    },

    /**
     * Toggles creation mode for new Alerts.
     * @private
     */
    _toggleCreatingAlert: function() {
        //Change the button state and styling.
        this._creatingNew = !this._creatingNew;
        this.toggleClass("selected", this._creatingNew, this.querySelector('.customMapBttn'));
        if (this._creatingNew) {
            //De-activate any loaded Alerts.
            if (this._loadedAlertTemplateData) {
                this._toggleAccordion(-1);
                this._loadedAlertTemplateData = null;
            }
            this._toggleActiveAlerts(false);
        }
        else {
            //Revert the cursor state, clear the temporary click listener and clear the selected Alert Template id.
            if (this._selectedAlertTemplateId) {
                this._map.setOptions({draggableCursor:''});
                google.maps.event.clearListeners(this._map,'click');
                google.maps.event.clearListeners(this._areaRegion.polygon,'click');
                this._selectedAlertTemplateId = null;
            }
        }
    },

    /**
     * Toggles the visible state of the active Alerts on the map.
     * @param visible
     * @private
     */
    _toggleActiveAlerts: function(visible) {
        var value = visible ? this._map : null;
        for (var i=0; i<this._alerts.length; i++) {
            //Hide the marker.
            this._alerts[i].marker.setMap(value);
            for (var j=0; j<this._alerts[i].alertTemplate.zones.features.length; j++) {
                //Hide the zones and their labels.
                this._alerts[i].alertTemplate.zones.features[j].tmpProperties.circle.setMap(value);
                this._alerts[i].alertTemplate.zones.features[j].tmpProperties.zoneOverlay.setMap(value);
            }
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
     * Fired when an Alert Template is selected when creating a new Alert.
     * @private
     */
    _selectAlertTemplate: function(e) {
        var _this = this;
        //Store the id of the selected Alert Template for later use.
        this._selectedAlertTemplateId = e.target.getAttribute('data-id');
        //Change the cursor to the icon of the Alert Template (17.5/35 offset so the click registers in the correct position)
        this._map.setOptions({draggableCursor:'url('+this.pathtoimages+'/img/alert_marker.png) 17.5 35, crosshair'});
        //Add click listeners to the map and area region so we can drop the new Alert wherever they click.
        google.maps.event.addListener(this._map,'click',createChildTemplate);
        google.maps.event.addListener(this._areaRegion.polygon,'click',createChildTemplate);
        //Create a new child Alert Template to be linked one-to-one with the Alert.
        function createChildTemplate(e) { _this._createChildTemplate(_this._selectedAlertTemplateId,e.latLng); }
    },

    /**
     *
     * @param parentAlertTemplateId
     * @param latLng
     * @private
     */
    _createChildTemplate: function(parentAlertTemplateId,latLng) {
        if (!google.maps.geometry.poly.containsLocation(latLng, this._areaRegion.polygon)) {
            this.fire('message-info','The Alert center must be inside your region.');
            return;
        }
        //Find and clone the Alert Template that we will build the child template from.
        var childTemplate = JSON.parse(JSON.stringify(this._parentTemplates.filter(function(alertTemplate) {
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
        this._loadedAlertTemplateData = {"alertTemplate":childTemplate,"marker":null,"isPersisted":false};
        this._updateAlertTemplateJSON();
        //Draw the new Alert Template.
        this._drawAlertEntity(this._loadedAlertTemplateData.alertTemplate);
        //Toggle the creation mode.
        this._toggleCreatingAlert();
    },

    /**
     * Removes the current Alert instance and it's associated template.
     * @private
     */
    _removeAlertEntity: function() {
        if (!this._loadedAlertTemplateData) { return; }
        if (this._loadedAlertTemplateData.alertInstance) { this._removeAlert(); }
        else { this._removeAlertTemplate(); }
        //Fire an event indicating that no zone is loaded (-1).
        this.fire('voyent-zone-toggled', {
            'alertTemplate': null,
            'selectedZoneIndex': -1
        });
    },

    /**
     * Removes the current Alert Template.
     * @returns {boolean}
     */
    _removeAlertTemplate: function() {
        var _this = this;
        //Delete from DB if it's saved.
        if (this._loadedAlertTemplateData.isPersisted) {
            voyent.locate.deleteTracker({
                realm: this.realm,
                account: this.account,
                id: this._loadedAlertTemplateData.alertTemplate._id
            }).catch(function (error) {
                _this.fire('message-error', 'Issue deleting Alert Template: ' + (error.responseText || error.message || error));
            });
        }
        //Clear the map immediately.
        _this.clearMap();
        return true;
    },

    /**
     * Removes the currently active Alert.
     * @private
     */
    _removeAlert: function() {
        var _this = this;
        //Just delete the Alert, the location service will handle deleting the associated child template.
        var properties = this._loadedAlertTemplateData.alertInstance.location.properties;
        voyent.locate.deleteTrackerInstance({account:this.account,realm:this.realm,
            id:properties.trackerId,zoneNamespace:properties.zoneNamespace}).then(function() {
                //Update our list of alerts and delete it from the map.
                _this.splice('_alerts',_this._alerts.indexOf(_this._loadedAlertTemplateData),1);
                _this.clearMap();
        }).catch(function(error) {
            _this.fire('message-error', 'Issue deleting Alert: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Toggles activation mode for the Alert.
     * @param e
     * @private
     */
    _toggleActivatingAlert: function(e) {
        this._activatingAlert = !this._activatingAlert;
        if (this._activatingAlert) {
            //In case there were changes, update the child Alert Template.
            this.saveAlertTemplate();
        }
    },

    /**
     * Handles all back functionality in the editor.
     * @private
     */
    _goBack: function() {
        //An Alert Instance is currently loaded so just de-select it.
        if (this._loadedAlertTemplateData.alertInstance) {
            //Toggle the accordion, make the zones un-editable and wipe the loaded Alert.
            this._toggleAccordion(-1);
            this._loadedAlertTemplateData = null;
        }
        else {
            //They are currently activating so just go back one step.
            if (this._activatingAlert) {
                this._toggleActivatingAlert();
            }
            else { //They are cancelling the creation so remove the template.
                this._promptForRemoval(function() {
                    this._removeAlertTemplate();
                    this._toggleActiveAlerts(true);
                    //Fire an event indicating that no zone is loaded (-1).
                    this.fire('voyent-zone-toggled', {
                        'alertTemplate': null,
                        'selectedZoneIndex': -1
                    });
                });
            }
        }
    },

    /**
     * Cancels the entire Alert creation process and deletes and child Alert Templates that may have been created.
     * @private
     */
    _cancel: function() {
        if (this._creatingNew) {
            this._toggleCreatingAlert();
            this._toggleActiveAlerts(true);
        }
        else if (this._activatingAlert) {
            this._promptForRemoval(function() {
                this._removeAlertTemplate();
                this._toggleActivatingAlert();
                this._toggleActiveAlerts(true);
                //Fire an event indicating that no zone is loaded (-1).
                this.fire('voyent-zone-toggled', {
                    'alertTemplate': null,
                    'selectedZoneIndex': -1
                });
            });
        }
    },

    /**
     * Wrapper for promptForRemoval so we can pass specific parameters from the template.
     * @private
     */
    _promptForRemovalWrp: function() {
        this._promptForRemoval('_removeAlertEntity');
    },

    /**
     * Opens a confirmation prompt for removing an Alert.
     * @param func
     * @private
     */
    _promptForRemoval: function(func) {
        var msg = 'Are you sure you want to delete ' + this._loadedAlertTemplateData.alertTemplate.label + '? This cannot be undone!';
        this._openDialog(msg,null,func);
    },

    /**
     * Initialize a keydown listener for canceling Alert creation.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        //If the escape key is pressed then stop.
        window.addEventListener('keydown',function (event) {
            if (event.which === 27 && _this._creatingNew) {
                _this._cancel();
            }
        });
    },

    /**
     * Returns the style classes for the list of Alert Template items.
     * @param thisTemplate
     * @param selectedTemplate
     * @private
     */
    _getTemplateClass: function(thisTemplate,selectedTemplate) {
        if (selectedTemplate && thisTemplate === selectedTemplate) {
            return 'item selected';
        }
        return 'item';
    }
});
