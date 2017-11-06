Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert changes. Includes an `alert` property that contains the loaded alert or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicates whether an alert is currently being fetched from database and loaded into the editor.
         */
        isAlertLoading: { type: Boolean, value: false, readOnly: true, notify: true, observer: '_isAlertLoading' },
        /**
         * Indicates whether an alert is currently loaded in the editor.
         */
        isAlertLoaded: { type: Boolean, value: false, readOnly:true, notify: true },
        /**
         * The currently loaded alert state.
         */
        alertState: { type: String, value: null, readOnly:true, notify: true }
    },

    observers: [
        '_showPropertiesPaneChanged(_showPropertiesPane)',
        '_loadedAlertChanged(_loadedAlert)',
        '_alertStateChanged(_loadedAlert.template.state)'
    ],

    ready: function() {
        //Initialize some vars
        this._parentTemplates = [];
        this._selectedAlertTemplateId = null;
    },

    /**
     * Loads an alert into the editor using the passed id.
     * @param id
     */
    loadAlert: function(id) {
        this._setIsAlertLoading(true);
        var _this = this;
        var promises = [];
        promises.push(this._fetchAlertTemplate(id));
        promises.push(this._fetchLocationRecord(id));
        Promise.all(promises).then(function(results) {
            //Clear the map of any loaded alert template before drawing.
            if (_this._loadedAlert) {
                _this.clearMap();
            }
            var latLng = new google.maps.LatLng(
                results[1].location.geometry.coordinates[1],
                results[1].location.geometry.coordinates[0]
            );
            //If we have no geo section it means the template contains only the fallback
            //zone so the coordinates they dropped the template at are meaningless.
            if (!results[0].geo) { latLng = null; }
            _this._drawAndLoadAlertTemplate(results[0],latLng);
            //Toggle the correct pane.
            _this._showPropertiesPane = true;
            _this._setIsAlertLoading(false);
        }).catch(function(error) {
            _this.fire('message-error', 'Issue loading saved alert: ' + (error.responseText || error.message || error));
        });
    },

    /**
     *
     * @returns {*}
     */
    activateAlert: function() {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to active alert: No alert loaded');
        }
        var activatableStates = ['draft','preview'];
        if (activatableStates.indexOf(this._loadedAlert.template.state) === -1) {
            return this.fire('message-error', 'Unable to active alert: State cannot be transitioned to active from ' + this._loadedAlert.template.state);
        }
        this._saveAlertTemplate().then(function() {
            _this.updateAlertState('active').then(function() {
                _this.fire('voyent-alert-template-saved',{});
            });
        });
    },

    /**
     * Removes the currently loaded alert from the database.
     */
    removeAlert: function() {
        var _this = this;
        this._promptForRemoval(function() {
            _this._showPropertiesPane = false;
            _this._removeAlert();
        });
    },

    /**
     *
     * @param state
     * @returns {*}
     */
    updateAlertState: function(state) {
        var _this = this;
        var validStates = ['draft','preview','active','deprecated','ended'];
        if (validStates.indexOf(state) === -1) {
            return this.fire('message-error', 'Unable to change alert state: State ' + this._loadedAlert.template.state + ' is invalid');
        }
        this._loadedAlert.template.setState(state);

        return new Promise(function (resolve, reject) {
            voyent.locate.updateAlertState({"id":_this._loadedAlert.template.id,"state":state}).then(function() {
                resolve();
            }).catch(function(error) {
                reject(error);
                _this.fire('message-error', 'Unable to change alert state: ' + (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Fetches the latest alert templates for the realm.
     * @returns {*}
     * @private
     */
    fetchAlertTemplates: function() {
        //Make sure we don't fetch the templates an unnecessary amount of times.
        if (this._isFetchingTemplates) { return; }
        this._isFetchingTemplates = true;
        var _this = this;
        return new Promise(function (resolve, reject) {
            voyent.locate.findAlertTemplates({realm:_this.realm,account:_this.account}).then(function(templates) {
                if (!templates) { return; }
                //Maintain a list of parent templates.
                _this._parentTemplates = templates.filter(function(alertTemplate) {
                    return !alertTemplate.properties || !alertTemplate.properties.parentAlertId;
                });
                //Maintain an id-mapped object of all templates, including child templates.
                _this._templatesMap = templates.reduce(function(map,obj) {
                    map[obj._id] = obj;
                    return map;
                },{});
                _this._isFetchingTemplates = false;
                resolve();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue fetching alert templates: ' + (error.responseText || error.message || error));
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
        this.fetchAlertTemplates();
        this._fetchRealmRegion();
        this._enableDefaultPane();
    },

    /**
     * Sets the side panel to the default view.
     * @private
     */
    _enableDefaultPane: function() {
        this._showTemplateListPane = true;
        this._showPropertiesPane = false;
    },

    /**
     * Revert the cursor state from the alert icon to the regular pointer.
     * @private
     */
    _revertCursor: function() {
        if (this._selectedAlertTemplateId) {
            this._map.setOptions({draggableCursor:''});
            //Clear the listeners to remove the temporary click
            //listener but make sure we re-add the permanent one.
            google.maps.event.clearListeners(this._map,'click');
            this._deselectStacksOnClick(this._map);
            this._selectedAlertTemplateId = null;
        }
    },

    /**
     * Returns the alert template name or the _id.
     * @param alertTemplate
     * @private
     */
    _getAlertTemplateName: function(alertTemplate) {
        return alertTemplate.name || alertTemplate._id;
    },

    /**
     * Fired when an alert template is selected when creating a new alert.
     * @private
     */
    _selectAlertTemplate: function(e) {
        var _this = this;
        this._selectedAlertTemplateId = e.target.getAttribute('data-id');
        //Find and clone the parent template that we will create the child from.
        var childTemplate = JSON.parse(JSON.stringify(this._parentTemplates.filter(function(alertTemplate) {
            return alertTemplate._id === _this._selectedAlertTemplateId;
        })[0]));
        if (childTemplate.properties.center) {
            var position = new google.maps.LatLng(childTemplate.properties.center);
            delete childTemplate.properties.center;
            this._createChildTemplate(childTemplate,position);
        }
        else {
            //Change the cursor to the icon of the alert template (17.5/35 offset so the click registers in the correct position)
            this._map.setOptions({draggableCursor:'url('+this.pathtoimages+'/img/alert_marker.png) 17.5 35, crosshair'});
            //Add click listeners to the map so we can drop the new alert wherever they click.
            google.maps.event.addListener(this._map,'click',createChildTemplate);
            //Create a new child alert template to be linked one-to-one with the alert.
            function createChildTemplate(e) { _this._createChildTemplate(childTemplate,e.latLng); }
        }
    },

    /**
     * Draws the passed template and converts it to a child template by adding the parenAlertId property.
     * @param childTemplate
     * @param latLng
     * @private
     */
    _createChildTemplate: function(childTemplate,latLng) {
        //Remove the parent's id from the record as we'll generate a new one.
        var id = childTemplate._id;
        delete childTemplate._id;
        //If we have no geo section it means the template contains only the fallback
        //zone so the coordinates they dropped the template at are meaningless.
        if (!childTemplate.geo) { latLng = null; }
        childTemplate.state = 'draft'; //Default to draft
        this._drawAndLoadAlertTemplate(childTemplate,latLng);
        this._loadedAlert.template.setParentId(id);
        this._showPropertiesPane = true;
    },

    /**
     * Removes the currently active alert.
     * @private
     */
    _removeAlert: function() {
        var _this = this;
        //Just delete the alert, the location service will handle deleting the associated child template.
        if (this._loadedAlert.template.id) {
            voyent.locate.deleteAlert({
                account:this.account,
                realm:this.realm,
                id:this._loadedAlert.template.id
            }).then(function() {
                _this._removeAlertTemplateFromMap();
            }).catch(function(error) {
                _this.fire('message-error', 'Issue deleting alert: ' + (error.responseText || error.message || error));
            });
        }
        else {
            _this._removeAlertTemplateFromMap();
        }
    },

    /**
     * Opens a confirmation prompt for removing an alert.
     * @param func
     * @private
     */
    _promptForRemoval: function(func) {
        if (!this._loadedAlert) { return; }
        var msg = 'Are you sure you want to delete ' + this._loadedAlert.template.name + '? This cannot be undone!';
        this._openDialog(msg,null,func);
    },

    /**
     *
     * @param showPropertiesPane
     * @private
     */
    _showPropertiesPaneChanged: function(showPropertiesPane) {
        this._showTemplateListPane = !showPropertiesPane;
        if (showPropertiesPane) {
            this._revertCursor();
        }
    },



    /**
     * Monitors the loaded alert and handles fallback zone button visibility.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        if (loadedAlert) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading an alert as they will just be added again.
        else if (!this.isAlertLoading) {
            this._removeAlertTemplateButtons();
        }
        this._setIsAlertLoaded(loadedAlert && loadedAlert.template);
        this.fire('voyent-alert-changed',{
            'alert': loadedAlert || null
        });
    },

    /**
     * Keeps the alertState property in sync with the loaded alert state.
     * @param state
     * @private
     */
    _alertStateChanged: function(state) {
        this._setAlertState(state || null);
    },

    /**
     * Returns the style classes for the list of alert template items.
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
