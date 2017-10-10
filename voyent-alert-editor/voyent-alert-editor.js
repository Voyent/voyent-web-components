Polymer({
    is: 'voyent-alert-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert changes. Includes an `alert` property that contains the loaded alert or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicate whether to hide the embedded save and remove buttons.
         * @default false
         */
        hideButtons: { type: Boolean, value: false }
    },

    observers: [
        '_showTemplateListPaneChanged(_showTemplateListPane)',
        '_loadedAlertChanged(_loadedAlert)'
    ],

    ready: function() {
        //Initialize some vars
        this._parentTemplates = [];
        this._selectedAlertTemplateId = null;
        //Add listener to native map button for cancelling creation.
        this._addListenerToStopDrawingBttn();
    },

    /**
     * Loads an alert into the editor using the passed id.
     * @param id
     */
    loadAlert: function(id) {
        var _this = this;
        var promises = [];
        promises.push(this._fetchAlertTemplate(id));
        promises.push(this._fetchLocationRecord(id));
        Promise.all(promises).then(function(results) {
            //Clear the map of any loaded alert template before drawing. Specify that we want to
            //skip the button draw because we will remove the button after drawing the new alert.
            if (_this._loadedAlert) {
                _this.clearMap(true);
            }
            var latLng = new google.maps.LatLng(
                results[1].location.geometry.coordinates[1],
                results[1].location.geometry.coordinates[0]
            );
            _this._drawAndLoadAlertTemplate(results[0],latLng);
            //Toggle the correct pane.
            _this._showPropertiesPane = _this._isActivated = true;
            _this._showNewAlertPane = false;
        }).catch(function(error) {
            _this.fire('message-error', 'Issue loading saved alert: ' + (error.responseText || error.message || error));
        });
    },

    /**
     * Removes the currently loaded alert from the database.
     */
    removeAlert: function() {
        this._backToNewAlertPane();
    },

    /**
     * Fetches the latest alert templates for the realm.
     * @returns {*}
     * @private
     */
    fetchAlertTemplates: function() {
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
                //Handle adding and removing the buttons depending on whether we have templates.
                if (_this._parentTemplates.length) {
                    _this._addAlertButton(_this._alertButtonListener.bind(_this));
                }
                else {
                    _this._removeAlertButton();
                }
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
        this._showNewAlertPane = true;
        this._showTemplateListPane = this._showPropertiesPane =
            this._isActivated  = this._showConfirmingAlertPane = false;
    },

    /**
     * The listener to fire when the alert button is clicked.
     * @private
     */
    _alertButtonListener: function() {
        if (this._showNewAlertPane) {
            this._proceedToTemplateListPane();
        }
        else {
            this._backToNewAlertPane();
        }
    },

    /**
     * Adds a listener to Google's native "Stop Drawing" button so we can de-activate our custom alert Button.
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
            bttn.onclick = _this._backToNewAlertPane.bind(_this);
        }
    },

    /**
     * Triggered when we want to navigate back to the create new alert pane.
     * @private
     */
    _backToNewAlertPane: function() {
        var _this = this;
        if (this._showTemplateListPane) {
            this._showNewAlertPane = true;
            this._showTemplateListPane = false;
        }
        else { //_showPropertiesPane || _showConfirmingAlertPane || regular removal
            this._promptForRemoval(function() {
                if (_this._showPropertiesPane) { _this._showPropertiesPane = false; }
                else if (_this._showConfirmingAlertPane) { _this._showConfirmingAlertPane = false; }
                _this._removeAlert();
                _this._isActivated = false;
                _this._showNewAlertPane = true;
                _this._addAlertButton(_this._alertButtonListener.bind(_this));
            });
        }
    },

    /**
     * Triggered when we want to navigate back to the properties pane.
     * @private
     */
    _backToPropertiesPane: function() {
        this._showPropertiesPane = true;
        this._showConfirmingAlertPane = false;
    },

    /**
     * Triggered when we want to navigate to the alert activation pane.
     * @private
     */
    _proceedToActivatingPane: function() {
        this._showConfirmingAlertPane = true;
        this._showPropertiesPane = false;
    },

    /**
     * Triggered when we want to navigate to the template list pane.
     * @private
     */
    _proceedToTemplateListPane: function() {
        this._showNewAlertPane = false;
        this._showTemplateListPane = true;
    },

    /**
     * Triggered when we want to navigate to the properties pane.
     * @private
     */
    _proceedToPropertiesPane: function() {
        this._showPropertiesPane = true;

        if (this._showTemplateListPane) {
            this._showTemplateListPane = false;
            this._removeAlertButton();
            this._isActivated = false;
        }
        else { //_showConfirmingAlertPane
            this._showConfirmingAlertPane = false;
            this._isActivated = true;
        }
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
        //Store the id of the selected alert template for later use.
        this._selectedAlertTemplateId = e.target.getAttribute('data-id');
        //Change the cursor to the icon of the alert template (17.5/35 offset so the click registers in the correct position)
        this._map.setOptions({draggableCursor:'url('+this.pathtoimages+'/img/alert_marker.png) 17.5 35, crosshair'});
        //Add click listeners to the map so we can drop the new alert wherever they click.
        google.maps.event.addListener(this._map,'click',createChildTemplate);
        //Create a new child alert template to be linked one-to-one with the alert.
        function createChildTemplate(e) { _this._createChildTemplate(_this._selectedAlertTemplateId,e.latLng); }
    },

    /**
     *
     * @param parentAlertId
     * @param latLng
     * @private
     */
    _createChildTemplate: function(parentAlertId,latLng) {
        //Find and clone the parent template that we will create the child from.
        var childTemplate = JSON.parse(JSON.stringify(this._parentTemplates.filter(function(alertTemplate) {
            return alertTemplate._id === parentAlertId;
        })[0]));
        //Remove the parent's id from the record as we'll generate a new one.
        delete childTemplate._id;
        this._drawAndLoadAlertTemplate(childTemplate,latLng);
        this._loadedAlert.template.setParentId(parentAlertId);
        //Toggle the creation mode.
        this._proceedToPropertiesPane();
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
     * Initialize a keydown listener for canceling alert creation.
     * @private
     */
    _setupDrawingListeners: function() {
        var _this = this;
        //If the escape key is pressed then stop.
        window.addEventListener('keydown',function (event) {
            if (event.which === 27 && _this._showTemplateListPane) {
                _this._backToNewAlertPane();
            }
        });
    },

    /**
     * Handles common code that we want to execute whenever we navigate to or from the template list pane.
     * @param showTemplateListPane
     * @private
     */
    _showTemplateListPaneChanged: function(showTemplateListPane) {
        this.toggleClass("selected", showTemplateListPane, this.querySelector('.customMapBttn'));
        if (!showTemplateListPane) {
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
            this._addFallbackZoneButton(this._fallbackZoneButtonListener.bind(this));
        }
        else {
            this._removeFallbackZoneButton();
        }
        
        this.fire('voyent-alert-changed',{
            'alert': loadedAlert || null
        });
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
