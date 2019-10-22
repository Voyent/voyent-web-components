Polymer({
    is: 'voyent-alert-template-editor',
    behaviors: [Voyent.AlertMapBehaviour, Voyent.AlertBehaviour],

    /**
     * Fires when the loaded alert template changes. Includes an `alertTemplate`
     * property that contains the loaded template or null if none is loaded.
     * @event voyent-alert-template-changed
     */

    properties: {
        /**
         * Indicates whether a template is currently being fetched from database and loaded into the editor.
         */
        isTemplateLoading: { type: Boolean, value: false, readOnly: true, notify: true, observer: '_isAlertLoading' },
        /**
         * Indicates whether a template is currently loaded in the editor.
         */
        isTemplateLoaded: { type: Boolean, value: false, readOnly:true, notify: true },
        /**
         * Bind to this property to indicate whether the component is currently visible so state can be properly managed.
         */
        visible: { type: Boolean, value: false, observer: '_visibleChanged' } /* Actual listener is in voyent-alert-map-behaviour.html */
    },

    observers: [
        '_loadedAlertChanged(_loadedAlert)'
    ],

    /**
     * Loads an alert template into the editor using the passed id.
     * @param id
     * @param loadAsNew
     */
    loadAlertTemplate: function(id,loadAsNew) {
        var _this = this;
        this._setIsTemplateLoading(true);
        this.disableFullscreenMode(); // Always load the map as a windowed component
        this._fetchAlertTemplate(id).then(function(template) {
            //Clear the map of any loaded alert template before drawing.
            if (_this._loadedAlert) {
                _this.clearMap();
            }
            var latLng = null;
            if (template.geo && template.categories && template.categories.indexOf('Sample') > -1) {
                latLng = _this._areaRegion.bounds.getCenter();
            }
            if (loadAsNew) {
                if (template.categories && template.categories.indexOf('Sample') > -1) {
                    template.categories.splice(template.categories.indexOf('Sample'),1);
                }
                delete template.lastUpdated;
                delete template.lastUpdatedBy;
                delete template._id;
            }
            _this._drawAndLoadAlertTemplate(template,latLng);
            _this._setIsTemplateLoading(false);
        }).catch(function (error) {
            _this.fire('message-error', 'Error loading saved alert template: ' + (error.responseText || error.message || error));
        });
        this._fetchTemplateCategories();
    },

    /**
     * Prompts the user to create a new template. On cancel the `voyent-alert-template-cancel` event will be fired.
     */
    addNew: function() {
        var _this = this;
        this._fetchTemplateCategories().then(function() {
            _this._openDialog('New Alert Template','Enter the alert template name','','Must provide a template name',null,true,true,function() {
                _this.clearMap();
                _this.set('_loadedAlert',{
                    template: new _this._AlertTemplate(
                        null,null,null,null,_this._dialogInput,_this._dialogBadge,
                        null,null,null,false,null,[]
                    ),
                    selectedStack: null
                });
            },function() {
                // While this should only ever fire when the template editor is visible and the
                // dialog open we will add an extra check in here just in case (VRAS-836)
                if (_this.visible) {
                    var dialog = _this.querySelector('#modalDialog');
                    if (dialog && dialog.opened) {
                        _this.fire('voyent-alert-template-cancel',{});
                    }
                }
            });
        });
    },

    /**
     * Opens a confirmation prompt for cancelling alert template creation or edits.
     * @private
     */
    cancel: function() {
        var msg;
        if (this._loadedAlert.template.id) {
            msg = 'Are you sure you want to revert all unsaved changes for "' +
                this._loadedAlert.template.name + '"? This action cannot be undone.';
        }
        else {
            msg = 'Are you sure you want to cancel creating ' +
                this._loadedAlert.template.name + '? This action cannot be undone.';
        }
        this._openDialog('Confirm Cancel',msg,null,null,null,false,false,'clearMap');
    },

    /**
     * Opens a dialog for choosing template categories.
     */
    chooseCategories: function() {
        this._openCategorySelector();
    },


    //******************PRIVATE API******************

    /**
     * Finish initializing after login.
     * @private
     */
    _onAfterLogin: function() {
        var _this = this;
        this._isLoggedIn = true; //Toggle for side panel.
        //Fetch the regions for the realm so we can populate the map with the current region.
        this._fetchRealmRegion();
        //Fetch realm-scope property for granting privileged access to sample templates.
        voyent.scope.getRealmData({"property":"isVrasAdministratorRealm"}).then(function(value) {
            _this.set('_isVrasAdministratorRealm',!!value);
        }).catch(function(){
            _this.set('_isVrasAdministratorRealm',false);
        });
    },

    /**
     * Removes the current alert template.
     * @private
     */
    _removeAlertTemplate: function() {
        var _this = this;
        //Delete from DB if it's saved.
        if (this._loadedAlert.template.id) {
            voyent.locate.deleteAlertTemplate({
                realm: this.realm,
                account: this.account,
                id: this._loadedAlert.template.id
            }).then(function() {
                _this._removeAlertTemplateFromMap();
            }).catch(function (error) {
                _this.fire('message-error', 'Issue deleting alert template: ' + (error.responseText || error.message || error));
            });
        }
        else {
            _this._removeAlertTemplateFromMap();
        }
    },

    /**
     * Returns the title property for the save position button.
     * @param savePosition
     * @param forceSavePosition
     * @returns {string}
     * @private
     */
    _getSavePositionButtonTitle: function(savePosition,forceSavePosition) {
        if (forceSavePosition) {
            return 'The location of this template will be remembered because this template contains one or more zones created from an imported file';
        }
        return savePosition
            ? 'The location of this template will be remembered'
            : 'The location of this template will not be remembered';
    },

    /**
     * Manages the templateLoaded property state, drawing button visibility
     * and fires the `voyent-alert-template-changed` event.
     * Manages the drawing button states based on whether an alert is loaded.
     * @param loadedAlert
     * @private
     */
    _loadedAlertChanged: function(loadedAlert) {
        var isAlertLoaded = !!(loadedAlert && loadedAlert.template);
        if (isAlertLoaded) {
            this._addAlertTemplateButtons();
        }
        //Don't bother removing the buttons if we are loading a template as they will just be added again.
        else if (!this.isTemplateLoading) {
            this._removeAlertTemplateButtons();
        }
        this._setIsTemplateLoaded(isAlertLoaded);
        this.fire('voyent-alert-template-changed',{
            'alertTemplate': loadedAlert && loadedAlert.template ? loadedAlert.template : null
        });
    },
});
