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
        alertState: { type: String, value: null, readOnly:true, notify: true },
        /**
         * Whether the user wants to hide the Sample templates or not
         */
        hideSample: { type: Boolean, value: false, observer: '_hideSampleChanged' },
        /**
         * Bind to this property to indicate whether the component is currently visible so state can be properly managed.
         */
        visible: { type: Boolean, value: false }
    },

    observers: [
        '_showPropertiesPaneChanged(_showPropertiesPane)',
        '_loadedAlertChanged(_loadedAlert)',
        '_alertStateChanged(_loadedAlert.template.state)'
    ],

    ready: function() {
        //Initialize parentTemplate list with a fake element so the "no templates found"
        //message won't flicker in the sidebar while we are fetching the templates.
        this._parentTemplates = ['tmp'];
        
        // Load any checkbox state
        this._applyHideSampleDefault();
    },

    /**
     * Loads an alert into the editor using the passed id.
     * @param id
     */
    loadAlert: function(id) {
        var _this = this;
        this._setIsAlertLoading(true);
        this.disableFullscreenMode(); // Always load the map as a windowed component
        var promises = [];
        promises.push(this._fetchAlertTemplate(id));
        promises.push(this._fetchLocationRecord(id));
        Promise.all(promises).then(function(results) {
            //Clear the map of any loaded alert template before drawing.
            if (_this._loadedAlert) {
                _this.clearMap();
            }
            var template = results[0];
            var latLng = null;
            if (template.geo) {
                latLng = new google.maps.LatLng(
                    results[1].location.geometry.coordinates[1],
                    results[1].location.geometry.coordinates[0]
                );
            }
            _this._drawAndLoadAlertTemplate(template,latLng);
            //Toggle the correct pane.
            _this._showPropertiesPane = true;
            _this._setIsAlertLoading(false);
            //Populate the movement pane, async so the properties panel has time to initialize.
            setTimeout(function() {
                if (typeof template.properties.direction !== 'undefined') {
                    _this.set('_alertDirection',template.properties.direction);
                }
                if (typeof template.properties.speed !== 'undefined') {
                    _this.set('_alertSpeed',template.properties.speed);
                    _this.set('_alertSpeedUnit',template.properties.speedUnit || 'kph');
                }
            },0);
        }).catch(function(e) {
            _this.fire('message-error', 'Issue loading saved alert, try again or contact a Voyent administrator');
            console.error('e',e);
        });
    },

    /**
     * Prompts the user to create a new alert.
     */
    addNew: function() {
        var _this = this;
        //Ensure we start with a clean state.
        this.set('_selectedAlertTemplate',null);
        this._sortTemplatesBy = 'name';
        this._lastSortOrderName = 'ascending';
        this._lastSortOrderCategories = 'ascending';
        this.set('_templateSearchQuery','');
        //Fetch the list of categories and templates before opening the dialog. Fetch the
        //categories first because we need them to build our list of categorized templates.
        var errMsg = 'Problem initializing alert editor, try again later or contact a Voyent Alert! Administrator';
        this._fetchTemplateCategories().then(function() {
            _this._fetchAlertTemplates().then(function() {
                _this._openNewAlertDialog();
                _this._queryTemplates(_this._templateSearchQuery); // Re-run the query to apply the state of our Hide Sample checkbox
            }).catch(function() {
                _this.fire('message-error',errMsg);
                _this._cancelNewAlert();
            });
        }).catch(function() {
            _this.fire('message-error',errMsg);
            _this._cancelNewAlert();
        });
    },

    /**
     * Handles persisting the alert as active or scheduled. The alerts may be revised or rescheduled by the service.
     * @returns {*}
     */
    activateAlert: function() {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to active alert: No alert loaded');
        }
        var activatableStates = ['draft','active','scheduled'];
        if (activatableStates.indexOf(this._loadedAlert.template.state) === -1) {
            return this.fire('message-error', 'Unable to activate alert: State cannot be transitioned from ' + this._loadedAlert.template.state);
        }
        var isNewActivation = !this._loadedAlert.template.id || this._loadedAlert.template.state === 'draft';
        this._loadedAlert.template.setState(this._loadedAlert.template.hasSchedule() ? 'scheduled' : 'active');
        this._saveAlert().then(function() {
            if (isNewActivation) {
                if (_this._loadedAlert.template.state === 'scheduled') {
                    _this.fire('message-info', 'New alert scheduled');
                }
                else {
                    _this.fire('message-info', 'New alert activated');
                }
            }
            else {
                if (_this._loadedAlert.template.state === 'scheduled') {
                    _this.fire('message-info', 'Alert successfully rescheduled');
                }
                else {
                    _this.fire('message-info', 'Alert successfully revised');
                }
            }
        }).catch(function(e) {});
    },

    /**
     * Saves the alert currently loaded in the editor as an alert template.
     *
     * @param funcBefore optional function to pass to the underlying template save call
     */
    saveAsAlertTemplate: function(funcBefore) {
        var _this = this;
        if (!this._loadedAlert || !this._loadedAlert.template) {
            return this.fire('message-error', 'Unable to save alert as template: No alert loaded');
        }
        this._openDialog('Save Alert As Template',null,null,null,'Save Location with Template?',false,false,function() {
            _this._loadedAlert.template.setSavePosition(_this._dialogToggle);
            var id = _this._loadedAlert.template.id;
            var parentId = _this._loadedAlert.template.parentId;
            _this._loadedAlert.template.setId(null);
            _this._loadedAlert.template.setParentId(null);
            _this._skipCategoryValidation = true;
            _this._saveAlertTemplate(funcBefore).then(function() {
                done();
                _this.fire('message-info', 'Successfully saved alert as template');
            }).catch(function(e) {
                if (e !== 'already saving template') {
                    _this.fire('message-error', 'Problem saving alert as template: ' + (e.responseText || e.message || e));
                    done();
                }
            });
            function done() {
                _this._loadedAlert.template.setSavePosition(false);
                _this._loadedAlert.template.setId(id);
                _this._loadedAlert.template.setParentId(parentId);
                _this._skipCategoryValidation = false;
            }
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
     * Transition an alert state from one state to another.
     * @param state
     * @returns {*}
     */
    updateAlertState: function(state) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var validStates = ['draft','scheduled','active','deprecated','ended'];
            if (validStates.indexOf(state) === -1) {
                var rejectMsg = 'Unable to change alert state: State ' + _this._loadedAlert.template.state + ' is invalid';
                _this.fire('message-error',rejectMsg);
                return reject(rejectMsg);
            }
            _this._loadedAlert.template.setState(state);
            voyent.locate.updateAlertState({"realm":_this.realm,"id":_this._loadedAlert.template.id,"state":state}).then(function() {
                resolve();
            }).catch(function(error) {
                reject(error);
                _this.fire('message-error', 'Unable to change alert state: ' + (error.responseText || error.message || error));
            });
        });
    },

    /**
     * Returns whether the loaded alert is configured for movement.
     * @returns {boolean}
     */
    isMovementConfigured: function() {
        return !!((this._alertDirection || this._alertDirection === 0) && this._alertSpeed);
    },

    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        this._isLoggedIn = true; //Toggle for side panel.
        this._fetchRealmRegion();
        this._enableDefaultPane();
    },

    /**
     * Fetches the latest alert templates for the realm.
     * @returns {*}
     * @private
     */
    _fetchAlertTemplates: function() {
        var _this = this;
        return new Promise(function (resolve, reject) {
            //Make sure we don't fetch the templates an unnecessary amount of times.
            if (_this._isFetchingTemplates) { return resolve(); }
            _this._isFetchingTemplates = true;
            voyent.locate.findAlertTemplates({"realm":_this.realm,"query": {"properties.parentAlertId":{"$exists":false}},
                "options":{"sort":{"lastUpdated":-1}}}).then(function(templates) {
                if (!templates || !templates.length) {
                    _this.set('_parentTemplates',[]);
                    _this.set('_filteredParentTemplates',[]);
                }
                else {
                    // Add a stringified version of the categories array that will be used for filtering and sorting
                    for (var i=0; i<templates.length; i++) {
                        var template = templates[i];
                        if (template.categories && template.categories.length) {
                            template.categoriesString = template.categories.join(', ');
                        }
                        else {
                            template.categoriesString = 'Uncategorized'
                        }
                    }
                    _this.set('_parentTemplates',templates);
                    _this.set('_filteredParentTemplates',templates.slice(0));
                }
                _this._isFetchingTemplates = false;
                resolve(_this._parentTemplates);
            }).catch(function (error) {
                _this.fire('message-error', 'Issue fetching alert templates: ' + (error.responseText || error.message || error));
                reject(error);
            });
        });
    },

    /**
     * Opens the dialog for creating a new alert.
     * @private
     */
    _openNewAlertDialog: function() {
        var dialog = this.querySelector('#newAlertDialog');
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Closes the dialog for creating a new alert.
     */
    closeNewAlertDialog: function() {
        var dialog = this.querySelector('#newAlertDialog');
        if (dialog) {
            dialog.close();
        }
    },

    /**
     * Handles submitting the new alert dialog via key press.
     * @param e
     * @private
     */
    _submitNewAlertDialog: function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') { //Enter
            this._createNewAlert();
        }
    },

    /**
     * Handles filtering the templates based on user input.
     * @private
     */
    _templateSearchQueryKeyUp: function() {
        this._queryTemplates(this._templateSearchQuery);
    },

    /**
     * Queries the template names and categories against the passed search query.
     * @param searchQuery
     * @private
     */
    _queryTemplates: function(searchQuery) {
        // Always execute the search query against a complete list so
        //  changes made via backspace, copy/paste, etc.. are applied properly
        this.set('_filteredParentTemplates', this._parentTemplates.slice(0));
        
        // Default to no search query, since we still might want to query based on Hide Sample checkbox
        var hasQuery = false;
        var searchQueryKeywords;
        if (searchQuery && searchQuery.trim()) {
            hasQuery = true;
            searchQueryKeywords = searchQuery.toLowerCase().split(' ');
        }
        
        for (var i = this._filteredParentTemplates.length-1; i >= 0; i--) {
            var matchCount = 0;
            
            if (hasQuery) {
                for (var j = 0; j < searchQueryKeywords.length; j++) {
                    var keyword = searchQueryKeywords[j];
                    // Ignore extra spaces
                    if (!keyword) {
                        matchCount++;
                        continue;
                    }
                    // Consider the keyword a match if it is found in either the name or categories of the template
                    if (this._filteredParentTemplates[i].name.toLowerCase().indexOf(keyword) > -1 ||
                        this._filteredParentTemplates[i].categoriesString.toLowerCase().indexOf(keyword) > -1) {
                        matchCount++;
                    }
                }
            }
            
            // All keywords must match in order for the result to be included
            // Also we check whether Sample templates should be hidden
            if ((hasQuery && matchCount !== searchQueryKeywords.length) ||
               (this.hideSample && (this._filteredParentTemplates[i].categories && this._filteredParentTemplates[i].categories.indexOf('Sample') > -1))) {
                this.splice('_filteredParentTemplates', i, 1);
            }
        }
        
        // Automatically select the template if there is only one result from filtering.
        if (this._filteredParentTemplates.length === 1) {
            this.set('_selectedAlertTemplate', this._filteredParentTemplates[0]);
        }
    },

    /**
     * Handles confirmation from the new alert dialog. Validates the dialog, builds the child template and closes the dialog.
     * @private
     */
    _createNewAlert: function() {
        if (!this._selectedAlertTemplate) {
            this.fire('message-error','Must select an alert template');
            return;
        }
        var _this = this;
        //Find and clone the parent template that we will create the child from.
        var childTemplate = JSON.parse(JSON.stringify(this._parentTemplates.filter(function(alertTemplate) {
            return alertTemplate._id === _this._selectedAlertTemplate._id;
        })[0]));
        var indexToSplice = childTemplate.categories ? childTemplate.categories.indexOf('Sample') : -1;
        if (indexToSplice > -1) {
            childTemplate.categories.splice(indexToSplice,1);
        }
        delete childTemplate.categoriesString;
        delete childTemplate.lastUpdated;
        delete childTemplate.lastUpdatedBy;
        //Load the template immediately if it has a center position defined or no geo section (fallback zone only).
        if (childTemplate.properties.center || !childTemplate.geo) {
            var position = null;
            if (childTemplate.properties.center) {
                position = new google.maps.LatLng(childTemplate.properties.center);
                delete childTemplate.properties.center;
            }
            this._createChildTemplate(childTemplate,position);
        }
        else {
            this._displayClickMapMsg = true;
            this.fire('message-info','Click a location on the map to place the alert...');
            //Change the cursor to a crosshair for accurate placement
            this._map.setOptions({draggableCursor:'crosshair'});
            //Add click listeners to the map so we can drop the new alert wherever they click. First clear the
            //listener to ensure that the user can click multiple alerts and always get the last one the selected.
            google.maps.event.clearListeners(this._map,'click');
            google.maps.event.addListener(this._map,'click',createChildTemplate);
            //Create a new child alert template to be linked one-to-one with the alert.
            function createChildTemplate(e) { _this._createChildTemplate(childTemplate,e.latLng); }
        }
        this.closeNewAlertDialog();
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
        this._displayClickMapMsg = false;
    },

    /**
     * Cancels new alert creation by firing the `voyent-alert-template-cancel` event.
     * @private
     */
    _cancelNewAlert: function() {
        var _this = this;
        // While this should only ever fire when the template editor is visible and the
        // dialog open we will add an extra check in here just in case (VRAS-836)
        if (this.visible) {
            var dialog = this.querySelector('#newAlertDialog');
            if (dialog && dialog.opened) {
                this._revertCursor();
                this.closeNewAlertDialog();
                setTimeout(function() {
                    _this.fire('voyent-alert-template-cancel',{});
                },0);
            }
        }
    },

    /**
     * Sorts the template list by name.
     * @private
     */
    _sortTemplatesByName: function() {
        this._sortTemplatesBy = 'name';
        this._lastSortOrderName = this._lastSortOrderName === 'ascending' ? 'descending' : 'ascending';
        this.querySelector('#alertTemplatesList').render();
    },

    /**
     * Sorts the template list by categories.
     * @private
     */
    _sortTemplatesByCategories: function() {
        this._sortTemplatesBy = 'categories';
        this._lastSortOrderCategories = this._lastSortOrderCategories === 'ascending' ? 'descending' : 'ascending';
        this.querySelector('#alertTemplatesList').render();
    },

    /**
     * Sorting function for the list of categorized parent templates.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortTemplates: function(a,b) {
        if (this._sortTemplatesBy === 'name') {
            if (this._lastSortOrderName === 'ascending') {
                return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
            }
            return b.name.toLocaleLowerCase().localeCompare(a.name.toLocaleLowerCase());
        }
        else {
            if (this._lastSortOrderCategories === 'ascending') {
                return a.categoriesString.toLocaleLowerCase().localeCompare(b.categoriesString.toLocaleLowerCase());
            }
            return b.categoriesString.toLocaleLowerCase().localeCompare(a.categoriesString.toLocaleLowerCase());
        }
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
        if (this._selectedAlertTemplate) {
            this._map.setOptions({draggableCursor:''});
            //Clear the listeners to remove the temporary click
            //listener but make sure we re-add the permanent one.
            google.maps.event.clearListeners(this._map,'click');
            this._deselectStacksOnClick(this._map);
            this._selectedAlertTemplate = null;
        }
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
     * Returns whether the current browser is MS Edge.
     * @returns {boolean}
     * @private
     */
    _isMsEdge: function() {
        if (navigator) {
            var userAgent = navigator.userAgent;
            if (userAgent) {
                return userAgent.indexOf('Edge/') > -1;
            }
        }
        return false;
    },

    /**
     * Opens a confirmation prompt for removing an alert.
     * @param func
     * @private
     */
    _promptForRemoval: function(func) {
        if (!this._loadedAlert) { return; }
        var msg = 'Are you sure you want to delete ' + this._loadedAlert.template.name + '? This cannot be undone!';
        this._openDialog('Confirm Delete Alert',msg,null,null,null,false,false,func);
    },

    /**
     * Handles state related to the toggling of the properties pane.
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
        var isAlertLoaded = !!(loadedAlert && loadedAlert.template);
        if (loadedAlert) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading an alert as they will just be added again.
        else if (!this.isAlertLoading) {
            this._removeAlertTemplateButtons();
        }
        this._setIsAlertLoaded(isAlertLoaded);
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
     * Hide Sample checkbox changed
     * We want to re-run our template query to update the list
     */
    _hideSampleChanged: function(newVal, oldVal) {
        // Re-run our query, which accounts for the state of the Hide Sample checkbox
        if (typeof oldVal !== 'undefined' && typeof newVal !== 'undefined') {
            this._queryTemplates(this._templateSearchQuery);
            
            if (this.hideSample) {
                voyent.$.setSessionStorageItem(btoa(voyent.auth.getLastKnownUsername() + 'hideSample'), btoa(this.hideSample));
            }
        }
    },
    
    _applyHideSampleDefault: function() {
        if (voyent.auth.getLastKnownUsername()) {
            var couldSet = atob(voyent.$.getSessionStorageItem(btoa(voyent.auth.getLastKnownUsername() + 'hideSample')));
            
            if (couldSet) {
                this.set('hideSample', couldSet === 'true' ? true : false);
            }
        }
    },
});
