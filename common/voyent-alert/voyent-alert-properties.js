Polymer({
    is: "voyent-alert-properties",
    behaviors: [Voyent.AlertBehaviour],

    properties: {
        /**
         * Indicates whether the parent component is `<voyent-alert-template-editor>`.
         */
        parentIsTemplateEditor: { type: Boolean },
        /**
         * Indicates whether the parent component is `<voyent-alert-editor>`.
         */
        parentIsAlertEditor: { type: Boolean },
        /**
         * Indicates whether the movement accordion will be shown.
         */
        showMovementAccordion: { type: Boolean, value: false },
        /**
         * Indicates whether the alert name at the top of the panel should be hidden.
         */
        hideAlertName: { type: Boolean, value: false },
        /**
         * Indicates whether the alert badge chooser at the top of the panel should be hidden.
         */
        hideBadgeChooser: { type: Boolean, value: false },
        /**
         * The list of colours to be used in the zone colour swatch picker.
         */
        zoneColours: { type: Array, value: ["#FF0000", "#FFB000", "#FFFF00", "#00FF00", "#0000FF", "#00EEFF", "#FF00DD"] },
        /**
         * Contains currently loaded _AlertTemplate object and the currently selected stack.
         * eg. { template:_AlertTemplate, selectedStack:_AlertZoneStack }
         */
        _loadedAlert: { type: Object, value: null, notify: true },
        /**
         * A container of data associated with the realm region boundary.
         */
        _areaRegion: { type: Object, value: null, notify: true },
        /**
         * A google maps data feature that represents the fallback (whole world) region.
         */
        _fallbackZone: { type: Object, value: null, notify: true },
        /**
         * The modal dialog title.
         */
        _dialogTitle: { type: String, value: '', notify: true },
        /**
         * The modal dialog message.
         */
        _dialogMessage: { type: String, value: '', notify: true },
        /**
         * Whether to show the modal dialog alert badge chooser.
         */
        _showDialogBadge: { type: Boolean, value: false, notify: true },
        /**
         * Whether to show the modal dialog input in the dialog message.
         */
        _showDialogInput: { type: Boolean, value: false, notify: true },
        /**
         * The value of the modal dialog input, if applicable.
         */
        _dialogInput: { type: String, value: '', notify: true },
        /**
         * The value of the modal dialog input validation message, if applicable.
         */
        _dialogInputMsg: { type: String, value: '', notify: true },
        /**
         * Whether to show the modal dialog toggle button in the dialog message.
         */
        _showDialogToggle: { type: Boolean, value: false, notify: true },
        /**
         * The value of the modal dialog toggle button, if applicable.
         */
        _dialogToggle: { type: Boolean, value: false, notify: true },
        /**
         * The value of the modal dialog toggle button label, if applicable.
         */
        _dialogToggleLabel: { type: String, value: '', notify: true },
        /**
         * The value of the modal dialog alert badge chooser, if applicable.
         */
        _dialogBadge: { type: String, value: '', notify: true },
        /**
         * The function called on modal dialog confirmation.
         */
        _dialogConfirmFunc: { type: Object, value: null, notify: true },
        /**
         * The function called on modal dialog cancellation.
         */
        _dialogCancelFunc: { type: Object, value: null, notify: true },
        /**
         * The direction of movement in degrees, only valid for alerts.
         */
        _alertDirection: { type: Number, value: null, notify: true },
        /**
         * The speed of movement in kph or mph, only valid for alerts.
         */
        _alertSpeed: { type: Number, value: null, notify: true },
        /**
         * The unit of movement speed, only valid for alerts.
         */
        _alertSpeedUnit: { type: String, value: null, notify: true },
        /**
         * Whether the movement accordion should be open, only valid for alerts.
         */
        _showMovement: { type: Boolean, value: false, notify: true },
        /**
         * Whether the alert badge accordion should be open.
         */
        _showBadge: { type: Boolean, value: false, notify: true},
        /**
         * A new template category to be added to the list of categories.
         */
        _newTemplateCategory: { type: String, notify: true },
        /**
         * An object array of the available template categories.
         */
        _templateCategories: { type: Array, value: [], notify: true },
        /**
         * An object array of the available template categories. Changes length based on user search queries.
         */
        _filteredTemplateCategories: { type: Array, value: [], notify: true },
        /**
         * The list of selected categories.
         */
        _selectedCategories: { type: Array, value: [], notify: true },
        /**
         * Whether a template save is pending after we prompt the user for an uncategorized template before saving.
         */
        _templateSavePending: { type: Boolean, value: false, notify: true },
        /**
         * Whether the category manager is shown in the category dialog, default is to show the category selector.
         */
        _showCategoryManager: { type: Boolean, value: false, notify: true },
        /**
         * The search query entered by the user to filter categories.
         */
        _categorySearchQuery: { type: String, value: '', notify: true },
        /**
         * Whether drawing mode was just cancelled, used to cancel overlay drawing when the button is toggled mid drawing operation.
         */
        _drawingCancelled: { type: Boolean, value: false, notify: true },
        /**
         * The width set from the previous map size calculation.
         */
        _lastWidth: { type: Number, notify: true },
        /**
         * The height set from the previous map size calculation.
         */
        _lastHeight: { type: Number, notify: true },
        /**
         * The zone being reshaped.
         */
        _zoneToReshape: { type: Object, value: null, notify: true },
        /**
         * The keydown listener for zone reshaping.
         */
        _zoneReshapeEscapeListener: { type: Function, value: null, notify: true },
        /**
         * The element containing the global wait cursor styling rule.
         */
        _cursorStylingRule: { type: Object, value: null, notify: true }
    },

    observers: [
        '_alertDirectionChanged(_alertDirection)',
        '_alertSpeedChanged(_alertSpeed)'
    ],

    attached: function() {
        var _this = this;
        // Async so the template has time to toggle
        setTimeout(function() {
            if (_this.parentIsTemplateEditor) {
                _this.querySelector('#newCategoryValidator').validate = _this._validateNewTemplateCategory.bind(_this);
                _this.querySelector('#existingCategoryValidator').validate = _this._validateExistingTemplateCategory.bind(_this);
            }
        },0);
    },

    ready: function() {
        var _this = this;
        //Initialize various flags.
        this._loadPointerLockAPI();
        //Initialize movement variables.
        this._alertSpeedUnit = 'kph';
        this._alertCardinalDirection = null;
        this._alertCardinalDirections = [
            {"label":"N","value":0},
            {"label":"NNE","value":22.5},
            {"label":"NE","value":45},
            {"label":"ENE","value":67.5},
            {"label":"E","value":90},
            {"label":"ESE","value":112.5},
            {"label":"SE","value":135},
            {"label":"SSE","value":157.5},
            {"label":"S","value":180},
            {"label":"SSW","value":202.5},
            {"label":"SW","value":225},
            {"label":"WSW","value":247.5},
            {"label":"W","value":270},
            {"label":"WNW","value":292.5},
            {"label":"NW","value":315},
            {"label":"NNW","value":337.5}
        ];
        //Flag for displaying the new category input when clicking the + icon.
        this._addingNewCategory = false;
    },

    /**
     * Opens the category manager dialog and immediately enables the new category input.
     * @private
     */
    _addFirstCategory: function() {
        this._openCategoryManager();
        this._enableNewCategoryInput();
    },

    /**
     * Opens the category management dialog.
     * @private
     */
    _openCategoryManager: function() {
        var _this = this;
        this.set('_showCategoryManager',true);
        setTimeout(function() {
            _this.querySelector('#categoryManager').center();
        },0);
    },

    /**
     * Reverts all changes made in the category management dialog.
     * @private
     */
    _closeCategoryManager: function() {
        var _this = this;
        //If we are currently editing or creating a new category and the user closes the category manager then save the changes.
        if (this._categoryBeingEdited) {
            this._disableCategoryNameEditing(this._categoryBeingEdited,true);
        }
        if (this._addingNewCategory) {
            this._disableNewCategoryInput(true);
        }
        //Toggle the category manager pane.
        this.set('_showCategoryManager',false);
        //Ensure our filtered list is up to date and any previous search results are applied.
        this.set('_filteredTemplateCategories',this._templateCategories.slice(0));
        this.set('_selectedCategories',this._selectedCategories.slice(0));
        this._queryCategories(this._categorySearchQuery);
        //Reset our toggles to ensure any edits before closing don't get applied on blur.
        this.set('_addingNewCategory',false);
        this.set('_categoryBeingEdited',null);
        setTimeout(function() {
            _this.querySelector('#categoryManager').center();
        },0);
    },

    /**
     * Handles deleting an existing category and prompting the user if the category is associated with existing templates.
     * @param e
     * @private
     */
    _deleteCategory: function(e) {
        var _this = this;
        e.stopPropagation();
        this._categoryToRemove = e.model.get('categoryObj');
        voyent.locate.findAlertTemplates({
            "query": {
                "properties.parentAlertId": { "$exists": false },
                "categories":this._categoryToRemove.name
            }
        }).then(function(templates) {
            //If the category is associated with templates then prompt the user otherwise just confirm the removal.
            if (templates && templates.length) {
                _this._associatedTemplates = templates;
                _this._openCategoryDeletionDialog();
            }
            else {
                _this._confirmCategoryDeletion();
            }
        }).catch(function () {
            _this.fire('message-error', 'Issue removing category, try again.');
            _this._cancelCategoryDeletion();
        });
    },

    /**
     * Removes a category marked for deletion from it's associated templates.
     * @param isRetry
     * @private
     */
    _removeCategoryFromTemplates: function(isRetry) {
        var _this = this;
        var categoryNameToRemove = this._categoryToRemove.name;
        var promises = [];
        for (var i=this._associatedTemplates.length-1; i>=0; i--) {
            (function(associatedTemplate) {
                //Remove the category from the template and update it.
                associatedTemplate.categories.splice(associatedTemplate.categories.indexOf(categoryNameToRemove),1);
                promises.push(voyent.locate.updateAlertTemplate({
                    "id": associatedTemplate._id,
                    "alertTemplate": associatedTemplate
                }).then(function() {
                    _this.splice('_associatedTemplates',_this._associatedTemplates.indexOf(associatedTemplate),1);
                }));
            })(this._associatedTemplates[i])
        }
        //Once all the update requests are complete we will confirm deletion of the category and close the dialog.
        //If for some reason all of the templates we're not updated we will retry the operation once.
        Promise.all(promises).then(function() {
            if (_this._associatedTemplates.length) {
                if (isRetry) {
                    _this.fire('Problem dissociating category from ' + _this._associatedTemplates[i].length + 'template(s), contact an administrator.');
                    return;
                }
                _this._removeCategoryFromTemplates(true);
            }
            else {
                _this._confirmCategoryDeletion();
                _this._closeCategoryDeletionDialog();
            }
        });
    },

    /**
     * Confirms deletion of a template category and closes the confirmation dialog.
     * @private
     */
    _confirmCategoryDeletion: function() {
        var _this = this;
        //Generate a flat string array of category names, remove the category and save the changes.
        var newTemplateCategories = this._templateCategories.reduce(function(result,categoryObj) {
            //Never persist the mobile or sample categories
            if (categoryObj.name === 'Mobile' || categoryObj.name === 'Sample') {
                return result;
            }
            result.push(categoryObj.name);
            return result;
        }, []);

        newTemplateCategories.splice(newTemplateCategories.indexOf(this._categoryToRemove.name),1);

        voyent.scope.createRealmData({data:{"templateCategories":newTemplateCategories}}).then(function() {
            //If we are currently editing the field that is being deleted then editing will be disabled automatically
            //when splicing so we must reset this property to indicate that we are no longer editing.
            if (_this._categoryToRemove.editing) {
                _this._categoryBeingEdited = null;
                _this._categoryInputInvalid = false;
            }
            //Remove the category from our local list.
            _this.splice('_templateCategories',_this._templateCategories.indexOf(_this._categoryToRemove),1);
            //If the user deletes a selected category then we need to manually remove it from the selected entries list.
            var index = _this._selectedCategories.indexOf(_this._categoryToRemove);
            if (index > -1) {
                _this.splice('_selectedCategories', index, 1);
            }
            _this._categoryToRemove = null;
            _this._associatedTemplates = [];
        }).catch(function() {
            _this.fire('message-error', 'Failed to remove category, try again');
            _this._categoryToRemove = null;
            _this._associatedTemplates = [];
        });
    },

    /**
     * Cancels template category deletion by closing the confirmation dialog.
     * @private
     */
    _cancelCategoryDeletion: function() {
        this._closeCategoryDeletionDialog();
        this._categoryToRemove = null;
        this._associatedTemplates = [];
    },

    /**
     * Opens a confirmation prompt when the category being deleted is being used in templates.
     * @private
     */
    _openCategoryDeletionDialog: function() {
        var dialog = this.querySelector('#confirmCategoryDeletionDialog');
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Closes the confirmation prompt displayed when the category being deleted is being used in templates.
     * @private
     */
    _closeCategoryDeletionDialog: function() {
        var dialog = this.querySelector('#confirmCategoryDeletionDialog');
        if (dialog) {
            dialog.close();
        }
    },

    /**
     * Enables the new category input when clicking on the + icon.
     * @param e
     * @private
     */
    _enableNewCategoryInput: function(e) {
        var _this = this;
        //Ensure existing category editing is disabled before adding a new category.
        this._disableCategoryNameEditing(this._categoryBeingEdited,true);
        //Enable the category input with a fresh state.
        this.set('_newTemplateCategory','');
        this.set('_addingNewCategory',true);
        setTimeout(function() {
            _this.querySelector('#newCategoryInput').focus();
            _this.querySelector('#newCategoryInput').invalid = false;
        },0);
    },

    /**
     * Disables the new category input. If validation is currently failing then the operation will be aborted.
     * @param persist
     * @private
     */
    _disableNewCategoryInput: function(persist) {
        var _this = this;
        if (!this._addingNewCategory) {
            return;
        }
        //If the new category input is currently invalid then just hide the input, reverting the changes.
        if (this._categoryInputInvalid) {
            this._confirmDisableNewCategoryInput();
            this._categoryInputInvalid = false;
            return;
        }
        //Handle persisting the new category or just hiding the input.
        if (persist && this._newTemplateCategory) {
            //Generate a flat string array of category names, add the new category and save the changes.
            var newTemplateCategories = this._templateCategories.reduce(function(result,categoryObj) {
                //Never persist the mobile or sample categories
                if (categoryObj.name === 'Mobile' || categoryObj.name === 'Sample') {
                    return result;
                }
                result.push(categoryObj.name);
                return result;
            }, []);

            newTemplateCategories.push(this._newTemplateCategory);

            voyent.scope.createRealmData({data:{"templateCategories":newTemplateCategories}}).then(function() {
                //Add the category to our local list.
                _this.push('_templateCategories',{
                    "id": _this._generateUid(),
                    "name": _this._newTemplateCategory,
                    "editable": true,
                    "newName": '',
                    "editing": false
                });
                //If the category manager is not shown it means the user typed in a new category and then immediately
                //clicked done. In this case we need to be sure to update the lists in the category selector.
                if (!_this._showCategoryManager) {
                    //Ensure our filtered list is up to date and any previous search results are applied.
                    _this.set('_filteredTemplateCategories',_this._templateCategories.slice(0));
                    _this.set('_selectedCategories',_this._selectedCategories.slice(0));
                    _this._queryCategories(_this._categorySearchQuery);
                }
                _this._confirmDisableNewCategoryInput();
            }).catch(function() {
                _this.fire('message-error', 'Failed to add new category, try again');
            });
        }
        else {
            this._confirmDisableNewCategoryInput();
        }
    },

    /**
     * Confirms disabling the new category input.
     * @private
     */
    _confirmDisableNewCategoryInput: function() {
        this.querySelector('#newCategoryInput').invalid = false;
        this.set('_addingNewCategory',false);
    },

    /**
     * Enables category name editing when clicking on a category.
     * @param e
     * @private
     */
    _enableCategoryNameEditing: function(e) {
        e.stopPropagation();
        var _this = this;
        var categoryBeingEdited = e.model.get('categoryObj');
        var index = this._templateCategories.indexOf(categoryBeingEdited);
        //Ensure existing category editing or new category creation is disabled before editing a different category.
        this._disableCategoryNameEditing(this._categoryBeingEdited,true);
        this._disableNewCategoryInput(true);
        this.set('_templateCategories.'+index+'.newName',_this._templateCategories[index].name);
        this.set('_templateCategories.'+index+'.editing',true);
        this._categoryBeingEdited = categoryBeingEdited;
        setTimeout(function() {
            _this.querySelector('#category-'+_this._categoryBeingEdited.id).focus();
        },0);
    },

    /**
     * Disables category name editing at the specified index. If validation is currently failing then the operation will be aborted.
     * @param categoryObj
     * @param persist
     * @private
     */
    _disableCategoryNameEditing: function(categoryObj,persist) {
        //Only proceed if we have valid data and if we are not already updating a category.
        if (!categoryObj || this._categoryToUpdate) {
            return;
        }
        var indexOfCategoryBeingEdited = this._templateCategories.indexOf(categoryObj);
        //If a category input is currently invalid then just hide the input, reverting the changes.
        if (this._categoryInputInvalid) {
            this._confirmDisableCategoryNameEditing(indexOfCategoryBeingEdited);
            this._categoryInputInvalid = false;
            return;
        }
        //Handle persisting the new category or just hiding the input. Since the blur event may fire multiple times
        //rapidly, like when editing a category and navigating away from the page, we will use the _persistingCategories
        //flag to prevent triggering requests to persist the categories more than necessary.
        if (!this._persistingCategories && persist && categoryObj.name !== categoryObj.newName) {
            this._persistingCategories = true;
            this._categoryToUpdate = categoryObj;
            this._updateCategory();
        }
        else {
            this._confirmDisableCategoryNameEditing(indexOfCategoryBeingEdited);
        }
    },

    /**
     * Confirms disabling category name editing mode.
     * @param index
     * @private
     */
    _confirmDisableCategoryNameEditing: function(index) {
        if (typeof index !== 'number' || !this._categoryBeingValidated) {
            return;
        }
        //Reset the newName value so that when we set it again when enabling editing the set is reflected
        //in the view. Additionally, toggle a flag so the input change listener doesn't fire and try to validate.
        this._ignoreChangeEvent = true;
        this.set('_templateCategories.'+index+'.newName','');
        this._ignoreChangeEvent = false;
        this.set('_templateCategories.'+index+'.editing',false);
        var input = this.querySelector('#category-'+this._categoryBeingValidated.id);
        if (input) {
            input.invalid = false;
        }
        this._categoryBeingEdited = null;
    },

    /**
     * Handles updating an existing category and prompting the user if the category is associated with existing templates.
     * @private
     */
    _updateCategory: function() {
        var _this = this;
        voyent.locate.findAlertTemplates({
            "query": {
                "properties.parentAlertId": { "$exists": false },
                "categories":this._categoryToUpdate.name
            }
        }).then(function(templates) {
            //If the category is associated with templates then prompt the user otherwise just confirm the edit.
            if (templates && templates.length) {
                _this._associatedTemplates = templates;
                _this._openCategoryUpdateDialog();
            }
            else {
                _this._confirmCategoryUpdate();
            }
        }).catch(function () {
            _this.fire('message-error', 'Issue updating category, try again.');
            _this._confirmCategoryUpdate();
        });
    },

    /**
     * Updates a category marked for update in it's associated templates.
     * @param isRetry
     * @private
     */
    _updateCategoryInTemplates: function(isRetry) {
        var _this = this;
        var categoryNameToUpdate = this._categoryToUpdate.name;
        var newCategoryName = this._categoryToUpdate.newName;
        var promises = [];
        for (var i=this._associatedTemplates.length-1; i>=0; i--) {
            (function(associatedTemplate) {
                //Replace the old category name with the new one and update the template.
                associatedTemplate.categories[associatedTemplate.categories.indexOf(categoryNameToUpdate)] = newCategoryName;
                associatedTemplate.categories.sort(_this._sortCategories);
                promises.push(voyent.locate.updateAlertTemplate({
                    "id": associatedTemplate._id,
                    "alertTemplate": associatedTemplate
                }).then(function() {
                    _this.splice('_associatedTemplates',_this._associatedTemplates.indexOf(associatedTemplate),1);
                }));
            })(this._associatedTemplates[i])
        }
        //Once all the update requests are complete we will confirm and close the dialog.
        //If for some reason all of the templates we're not updated we will retry the operation once.
        Promise.all(promises).then(function() {
            if (_this._associatedTemplates.length) {
                if (isRetry) {
                    _this.fire('Problem updating category in ' + _this._associatedTemplates[i].length + 'template(s), contact an administrator.');
                    return;
                }
                _this._updateCategoryInTemplates(true);
            }
            else {
                _this._confirmCategoryUpdate();
                _this._closeCategoryUpdateDialog();
            }
        });
    },

    /**
     * Confirms updating of a template category and closes the confirmation dialog.
     * @private
     */
    _confirmCategoryUpdate: function() {
        var _this = this;
        //Determine the index of the category object in each of our lists so we can update the view.
        var indexOfCategoryBeingEdited = this._templateCategories.indexOf(this._categoryToUpdate);
        var indexOfSelectedCategoryBeingEdited = this._selectedCategories.indexOf(this._categoryToUpdate);
        var indexOfFilteredCategoryBeingEdited = this._filteredTemplateCategories.indexOf(this._categoryToUpdate);
        //Generate a flat string array of category names, update the category and save the changes.
        var newTemplateCategories = this._templateCategories.map(function(categoryObj) {
            return categoryObj.name;
        });
        newTemplateCategories[indexOfCategoryBeingEdited] = this._categoryToUpdate.newName;
        //Never persist the mobile or sample categories
        newTemplateCategories.splice(newTemplateCategories.indexOf('Mobile'),1);
        newTemplateCategories.splice(newTemplateCategories.indexOf('Sample'),1);

        voyent.scope.createRealmData({data:{"templateCategories":newTemplateCategories}}).then(function() {
            //Update our local lists and state.
            _this._persistingCategories = false;
            _this.set('_templateCategories.'+indexOfCategoryBeingEdited+'.name',_this._categoryToUpdate.newName);
            //The category objects are shared in each list but we need to notifyPath for the UI to update.
            if (indexOfSelectedCategoryBeingEdited > -1) {
                _this.notifyPath('_selectedCategories.'+indexOfSelectedCategoryBeingEdited+'.name');
            }
            if (indexOfFilteredCategoryBeingEdited > -1) {
                _this.notifyPath('_filteredTemplateCategories.'+indexOfFilteredCategoryBeingEdited+'.name');
            }
            _this._confirmDisableCategoryNameEditing(indexOfCategoryBeingEdited);
            //Force a re-sort of the categories list.
            _this.querySelector('#editableTemplateCategoriesList').render();
            _this._categoryToUpdate = null;
            _this._associatedTemplates = [];
        }).catch(function() {
            _this.fire('message-error', 'Failed to update category, try again');
            _this._persistingCategories = false;
            _this._categoryToUpdate = null;
            _this._associatedTemplates = [];
        });
    },

    /**
     * Cancels the template category update by closing the confirmation dialog and updating some state.
     * @private
     */
    _cancelCategoryUpdate: function() {
        this._closeCategoryUpdateDialog();
        this._confirmDisableCategoryNameEditing(this._templateCategories.indexOf(this._categoryToUpdate));
        this._persistingCategories = false;
        this._categoryToUpdate = null;
        this._associatedTemplates = [];
    },

    /**
     * Opens a confirmation prompt when the category being edited is being used in templates.
     * @private
     */
    _openCategoryUpdateDialog: function() {
        var dialog = this.querySelector('#confirmCategoryUpdateDialog');
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Closes the confirmation prompt displayed when the category being edited is being used in templates.
     * @private
     */
    _closeCategoryUpdateDialog: function() {
        var dialog = this.querySelector('#confirmCategoryUpdateDialog');
        if (dialog) {
            dialog.close();
        }
    },

    /**
     * Validates the new category input in the category management dialog.
     * @private
     */
    _validateNewTemplateCategory: function() {
        return this._validateCategory(
            this.querySelector('#newCategoryInput'),
            this._newTemplateCategory
        );
    },

    /**
     * Validates the existing category inputs in the category management dialog.
     * @private
     */
    _validateExistingTemplateCategory: function() {
        return this._validateCategory(
            this.querySelector('#category-'+this._categoryBeingValidated.id),
            this._categoryBeingValidated.newName
        );
    },

    /**
     * Generic function to validate template categories.
     * @param categoryInput
     * @param categoryName
     * @returns {boolean}
     * @private
     */
    _validateCategory: function(categoryInput,categoryName) {
        if (!categoryName || !categoryName.trim().length) {
            categoryInput.setAttribute('error-message','Specify a category');
            return false;
        }
        if (categoryName.length > 60) {
            categoryInput.setAttribute('error-message','60 characters max');
            return false;
        }
        if (categoryName.trim().toLowerCase() === 'sample') {
            categoryInput.setAttribute('error-message','Sample is reserved');
            return false;
        }
        if (categoryName.trim().toLowerCase() === 'mobile') {
            categoryInput.setAttribute('error-message','Mobile is reserved');
            return false;
        }
        for (var i=0; i<this._templateCategories.length; i++) {
            if (this._templateCategories[i] === this._categoryBeingValidated) { continue; }
            if (categoryName.toLowerCase() === this._templateCategories[i].name.toLowerCase()) {
                categoryInput.setAttribute('error-message','Category exists');
                return false;
            }
        }
        return true;
    },

    /**
     * Validates one or more category inputs in the category management dialog and sets a flag indicating current validation state.
     * @param e
     * @private
     */
    _validateCategoryOnChange: function(e) {
        var _this = this;
        if (this._ignoreChangeEvent) { return; }
        //Async since this on-value-changed listener fires before the new value is reflected to the property.
        setTimeout(function() {
            if (e.model.get('categoryObj')) {
                _this._categoryBeingValidated = e.model.get('categoryObj');
                _this._categoryInputInvalid = !_this.querySelector('#category-'+_this._categoryBeingValidated.id).validate();
            }
            else {
                _this._categoryInputInvalid = !_this.querySelector('#newCategoryInput').validate();
            }
        },0);
    },

    /**
     * Handles submitting the new category input field on blur.
     * @private
     */
    _newCategoryBlur: function(e) {
        e.stopPropagation();
        var _this = this;
        //Always execute this async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode (polymer fires blur event even when the input has focus). Also check
            //if we are in editing mode because if we are not then it means that focus was removed via the Enter
            //or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') !== 'iron-input' && _this._addingNewCategory) {
                _this._disableNewCategoryInput(true);
            }
        },150); //Delay for when a user clicks another category so we don't trigger the disable function here, we will
                //call this when enabling the new one in _enableCategoryNameEditing.
    },

    /**
     * Handles submitting an existing category input field on blur.
     * @param e
     * @private
     */
    _existingCategoryBlur: function(e) {
        e.stopPropagation();
        var _this = this;
        //Always execute this async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode (polymer fires blur event even when the input has focus). Also check if the
            //focus is on the close button because this means they are deleting the category. Finally we'll check
            //if we are in editing mode because if we are not then it means that focus was removed via the Enter
            //or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') !== 'iron-input' &&
                document.activeElement.getAttribute('icon') !== 'close' &&
                _this._categoryBeingEdited) {
                _this._disableCategoryNameEditing(_this._categoryBeingEdited,true);
            }
        },150); //Delay for when a user clicks another category so we don't trigger the disable function here, we will
                //call this when enabling the new one in  _enableCategoryNameEditing or _enableNewCategoryInput.
    },

    /**
     * Handles submitting an existing category input field on enter key presses and cancelling on escape key presses.
     * @param e
     * @private
     */
    _existingCategoryKeyup: function(e) {
        e.stopPropagation();
        var categoryObj = e.model.get('categoryObj');
        if (e.key === 'Enter') {
            this._disableCategoryNameEditing(categoryObj,true);
        }
        else if (e.key === 'Escape') {
            this._disableCategoryNameEditing(categoryObj,false);
        }
    },

    /**
     * Handles submitting the new category input field on enter key presses.
     * @param e
     * @private
     */
    _newCategoryKeyUp: function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') {
            this._disableNewCategoryInput(true);
        }
        else if (e.key === 'Escape') {
            this._disableNewCategoryInput(false);
        }
    },

    /**
     * Handles filtering the template categories based on user input.
     * @private
     */
    _categorySearchQueryKeyUp: function() {
        this._queryCategories(this._categorySearchQuery);
    },

    /**
     * Queries the categories against the passed search query.
     * @param searchQuery
     * @private
     */
    _queryCategories: function(searchQuery) {
        //Always execute the search query against a complete list so
        //changes made via backspace, copy/paste, etc.. are applied properly.
        this.set('_filteredTemplateCategories',this._templateCategories.slice(0));
        if (!searchQuery || !searchQuery.trim()) {
            return;
        }
        for (var i=this._filteredTemplateCategories.length-1; i>=0; i--) {
            if (this._filteredTemplateCategories[i].name.toLowerCase().indexOf(searchQuery.toLowerCase()) === -1) {
                this.splice('_filteredTemplateCategories',i,1);
            }
        }
    },

    /**
     * An alphabetical sorting function for alert template categories.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortCategories: function(a,b) {
        if (typeof a.name === 'string') {
            return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
        }
        else {
            return a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase());
        }
    },

    /**
     * Template helper indicating whether we have one template associated with a specific category.
     * @param length
     * @returns {boolean}
     * @private
     */
    _haveOneAssociatedTemplate: function(length) {
        return length === 1;
    },

    /**
     * Adds a new proximity zone to the alert template. The new zone is 50% larger than the largest existing zone.
     * @private
     */
    _addProximityZone: function(e) {
        var _this = this;
        var newZone, paths, intersects;
        var closestSmallerZone = e.model.get('zone');
        var insertAtIndex = e.model.get('zoneIndex')+1;
        var closestLargerZone = _this._loadedAlert.selectedStack.getZoneAt(insertAtIndex);
        // Derive the "shape" of the zone from the closest smaller zone
        var isCircle = closestSmallerZone.isCircle;
        // Set the new zone size as 50% larger than the current largest zone
        var newZonePercentLarger = 50;

        // If we're adding the new zone in between zones then we must ensure
        // that the new zone is fully within the zone at newZoneIndex+1
        if (closestLargerZone) {
            paths = this._adjustNewZoneSizeToFit(closestSmallerZone, closestLargerZone, newZonePercentLarger);
            if (!paths) {
                return;
            }
        }
        // Otherwise if we're adding the zone to the end of the stack then check if the new zone will overlap another existing zone
        else {
            paths = this._adjustPathsByPercentage(closestSmallerZone.shapeOverlay.getPaths(), newZonePercentLarger, this._havePointerLock);
        }
        // If we have a polygon then check if the outer boundary of the new zone overlaps with the boundary
        // of the inner zone. If they overlap then we are unable to draw the shape and will instead
        // try to draw a rectangle matching the bounds of the zone we are inserting after
        if (!isCircle) {
            if (_this._lineIntersect(
                _this._AlertTemplate.calculateCoordinatesFromPaths(paths)[0],
                _this._AlertTemplate.calculateCoordinatesFromPaths(closestSmallerZone.shapeOverlay.getPaths())[0])
            ) {
                // The zone intersected so try to create a rectangular zone instead. If we are adding the zone to
                // the middle of the stack then we will create the rectangle as small as possible (1% larger)
                // otherwise just use the bounding box of new zone that we originally tried to create
                if (closestLargerZone) {
                    paths = _this._adjustPathsByPercentage(closestSmallerZone.shapeOverlay.getPaths(), 1, _this._havePointerLock);
                    paths = _this._getRectangularPathFromPolygonPath(paths.getAt(0));
                    if (_this._lineIntersect(
                        _this._AlertTemplate.calculateCoordinatesFromPaths(paths)[0],
                        _this._AlertTemplate.calculateCoordinatesFromPaths(closestLargerZone.paths)[0])
                    ) {
                        _this.fire('message-error', 'Unable to fit new zone between ' + closestSmallerZone.name + ' and ' + closestLargerZone.name);
                        return;
                    }
                }
                else {
                    paths = _this._getRectangularPathFromPolygonPath(paths.getAt(0));
                }
                //_this.fire('message-info','Unable to produce scaled polygon, drawing rectangle instead');
            }
        }
        this._openDialog('Add New Zone','Enter the zone name','','Must provide a zone name',null,false,false,function() {
            var name = _this._dialogInput;
            // De-increment the new zone zIndex so it sits behind the other zones
            var zIndex = closestSmallerZone.zIndex - 1;
            // When we add a new zone we don't want to include the full shape so we can punch
            // it out properly later so just pass the filled outer shape via paths.getAt(0)
            newZone = new _this._AlertZone(null,name,[paths.getAt(0)],isCircle,null,null,null,null,null,zIndex,false);

            // Insert the zone somewhere in the middle of the stack
            if (closestLargerZone) {
                _this._loadedAlert.selectedStack.insertZone(newZone, insertAtIndex);
            }
            else {
                // Add the zone to the end of the stack
                _this._loadedAlert.selectedStack.addZone(newZone);
                // Re-adjust the centroid for the template
                _this._loadedAlert.template.updateJSONAndCentroid();
                // Re-punch out the fallback zone
                if (_this._fallbackZone) {
                    _this._fallbackZone.punchOutOverlay();
                }
            }
            _this.fire('voyent-alert-zone-added',{
                "id": newZone.id, "zone": newZone,
                "stack": _this._loadedAlert.selectedStack,
                "insertIndex": insertAtIndex,
                "isFallbackZone": false
            });
            //Show the properties pane for the new zone.
            _this._toggleProperties(newZone);
        });
    },

    /**
     * Recursive function that tries to create a zone that will fit within the boundaries of the outer zone.
     * @param closestSmallerZone
     * @param closestLargerZone
     * @param percentage
     * @returns {*}
     * @private
     */
    _adjustNewZoneSizeToFit: function(closestSmallerZone,closestLargerZone,percentage) {
        // If the percentage is 0 then it means the shape will not fit between the two zones so we'll bail
        if (percentage === 0) {
            this.fire('message-error', 'Unable to fit new zone between ' + closestSmallerZone.name + ' and ' + closestLargerZone.name);
            return null;
        }
        // Calculate new paths based on the passed percentage
        var paths = this._adjustPathsByPercentage(closestSmallerZone.shapeOverlay.getPaths(), percentage, this._havePointerLock);
        // Determine if the new zone is fully within the closest outer zone
        var newZoneInsideOuterZone = this._booleanWithin(
            this._AlertTemplate.calculateCoordinatesFromPaths(paths), // new zone, {{percentage}}% larger
            [this._AlertTemplate.calculateCoordinatesFromPaths(closestLargerZone.paths)[0]] // the non-punched out version of the next largest zone
        );
        // The new zone is not fully within the outer zone so decrease the size
        if (!newZoneInsideOuterZone) {
            return this._adjustNewZoneSizeToFit(closestSmallerZone,closestLargerZone,percentage-1);
        }
        // The new zone is within the outer zone
        return paths;
    },

    /**
     * Wrapper for turf.booleanWithin.
     * @param innerZoneCoordinates
     * @param outerZoneCoordinates
     * @returns {*}
     * @private
     */
    _booleanWithin: function(innerZoneCoordinates, outerZoneCoordinates) {
        return turf.booleanWithin(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": innerZoneCoordinates
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": outerZoneCoordinates
                }
            }
        );
    },

    /**
     * Wrapper for turf.lineIntersect
     * @param lineCoordinatesA
     * @param lineCoordinatesB
     * @returns {boolean}
     * @private
     */
    _lineIntersect: function(lineCoordinatesA,lineCoordinatesB) {
        var intersects = turf.lineIntersect(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": lineCoordinatesA
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": lineCoordinatesB
                }
            }
        );
        return !!intersects.features.length
    },

    /**
     * Removes the proximity zone from the alert template.
     * @private
     */
    _removeProximityZone: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        var zone = this._loadedAlert.selectedStack.getZoneAt(e.model.get('zoneIndex'));
        var id = zone.id;
        if (this._loadedAlert.selectedStack.zones.length === 1) {
            this._loadedAlert.template.removeZoneStack(this._loadedAlert.selectedStack);
            if (this._fallbackZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }
        else {
            var isLargestZone = this._loadedAlert.selectedStack.getLargestZone() === zone;
            this._loadedAlert.selectedStack.removeZone(zone);
            if (this._fallbackZone && isLargestZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }

        // When removing a zone we need to check whether we need to force saving the position
        // with the template since it's possible that the user will remove the only zone
        // they imported from a file, removing the requirement of force saving the position
        var haveStackFromFile = false;
        var zoneStacks = this._loadedAlert.template.zoneStacks;
        for (var i=0; i<zoneStacks.length; i++) {
            if (zoneStacks[i].fromFile) {
                haveStackFromFile = true;
                break;
            }
        }
        this._loadedAlert.template.forceSavePositionWithTemplate(haveStackFromFile);

        this.fire('voyent-alert-zone-removed',{"id":id,"isFallbackZone":false});
    },

    /**
     * Opens a confirmation prompt for removing a proximity zone.
     * @param e
     * @private
     */
    _removeProximityZonePrompt: function(e) {
        var _this = this;
        var zone = this._loadedAlert.selectedStack.getZoneAt(e.model.get('zoneIndex'));
        var msg = 'Are you sure you want to delete ' + zone.name + '?';
        this._openDialog('Confirm Zone Deletion',msg,null,null,null,false,false,function() {
            _this._removeProximityZone(e);
        });
    },

    /**
     * Removes the fallback zone entirely.
     * @private
     */
    _removeFallbackZone: function() {
        this._fallbackZone.removeFromMap();
    },

    /**
     * Fires the `voyent-alert-trigger-copy` event so the button can be handled externally.
     * @private
     */
    _triggerZoneCopy: function() {
        this.fire('voyent-alert-trigger-copy');
    },

    /**
     * Updates the zone colour.
     * @param e
     * @private
     */
    _updateColour: function(e) {
        //If we have a z-index it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = typeof e.model.get('zoneIndex') !== 'undefined' ?
            this._loadedAlert.selectedStack.getZoneAt(e.model.get('zoneIndex')) :
            this._fallbackZone;
        zone.setColour(zone.colour);
    },

    /**
     * Checks if the browser has support for the Pointer Lock API, saves a reference to the browser
     * specific implementations of the relevant functions and sets up any required listeners.
     * @private
     */
    _loadPointerLockAPI: function() {
        this._isPointerLocked = false;
        //Check if the API is available.
        this._havePointerLock = 'pointerLockElement' in document ||
            'mozPointerLockElement' in document ||
            'webkitPointerLockElement' in document;
        if (!this._havePointerLock) { return; }
        this._bindPointerLockListeners();
        //Initialize our enable and disable functions using the specific browser prefixes.
        this._requestPointerLock = this.requestPointerLock ||
            this.mozRequestPointerLock ||
            this.webkitRequestPointerLock;
        document.exitPointerLock = document.exitPointerLock ||
            document.mozExitPointerLock ||
            document.webkitExitPointerLock;
        //Hook pointer lock state change events.
        document.addEventListener('pointerlockchange', this._boundPointerLockChangeListener, false);
        document.addEventListener('mozpointerlockchange', this._boundPointerLockChangeListener, false);
        document.addEventListener('webkitpointerlockchange', this._boundPointerLockChangeListener, false);

    },

    /**
     * Listens for changes to pointer lock state and manages associated listeners.
     * @private
     */
    _pointerLockChangeListener: function() {
        if (document.pointerLockElement === this ||
            document.mozPointerLockElement === this ||
            document.webkitPointerLockElement === this) {
            //Reset our mousemove related vars.
            this._y = 0;
            this._previousY = -1;
            //Pointer was just locked, enable the mousemove and click listeners.
            this._isPointerLocked = true;
            this.addEventListener("mousemove", this._boundMouseMoveListener, false);
            this.addEventListener("click", this._boundMouseClickListener, false);
        }
        else {
            //Pointer was just unlocked, disable the mousemove and click listeners.
            this._isPointerLocked = false;
            this.removeEventListener("mousemove", this._boundMouseMoveListener, false);
            this.removeEventListener("click", this._boundMouseClickListener, false);
        }
    },

    /**
     * Listens for mouse movements while the pointer is locked. Handles adjusting the size of the zones.
     * @param e
     * @private
     */
    _mouseMoveListener: function(e) {
        this._y += (e.movementY || e.mozMovementY || e.webkitMovementY || 0);
        // Prevent the user from modifying the size of the shape so it extends into other zones in the stacks. Compare
        // the areas by checking for any intersections since the polygons in a stack can all be different shapes.
        var innerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)-1);
        var outerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)+1);
        var newPath, intersects, percentage=2;
        if (this._y <= this._previousY) { //The zone size is increasing
            newPath = this._adjustPathsByPercentage(this._zoneToAdjust.shapeOverlay.getPaths(),percentage,true).getAt(0);
            if (outerZone) { //We are resizing an inner zone
                var outerZonePath = outerZone.shapeOverlay.getPaths().getAt(0);
                //Check if the zone has grown to be larger than the next closest outer zone
                if (google.maps.geometry.spherical.computeArea(newPath) >=
                    google.maps.geometry.spherical.computeArea(outerZonePath)) {
                    this._displayOverlapMsg();
                    this._y = this._previousY;
                    return;
                }
                else {
                    //Check if it overlaps its next closest outer zone
                    intersects = this._lineIntersect(
                        this._AlertTemplate.calculateCoordinatesFromPaths(
                            new google.maps.MVCArray([newPath])
                        )[0],
                        this._AlertTemplate.calculateCoordinatesFromPaths(
                            new google.maps.MVCArray([outerZonePath])
                        )[0]
                    );
                    if (intersects) {
                        this._displayOverlapMsg();
                        this._y = this._previousY;
                        return;
                    }
                }
            }
            this._zoneToAdjust.setPaths([newPath]);
        }
        else if (this._y > this._previousY) { //The zone size is decreasing
            newPath = this._adjustPathsByPercentage(this._zoneToAdjust.shapeOverlay.getPaths(),-percentage,true).getAt(0);
            if (innerZone) { //We are resizing an outer zone
                var innerZonePath = innerZone.shapeOverlay.getPaths().getAt(0);
                //Check if the zone has grown to be smaller than the next closest inner zone
                if (google.maps.geometry.spherical.computeArea(newPath) <=
                    google.maps.geometry.spherical.computeArea(innerZonePath)) {
                    this._displayOverlapMsg();
                    this._y = this._previousY;
                    return;
                }
                else {
                    //Check if it overlaps its next closest inner zone
                    intersects = this._lineIntersect(
                        this._AlertTemplate.calculateCoordinatesFromPaths(
                            new google.maps.MVCArray([newPath])
                        )[0],
                        this._AlertTemplate.calculateCoordinatesFromPaths(
                            new google.maps.MVCArray([innerZonePath])
                        )[0]
                    );
                    if (intersects) {
                        this._displayOverlapMsg();
                        this._y = this._previousY;
                        return;
                    }
                }
            }
            this._zoneToAdjust.setPaths([newPath]);
        }
        //No failures so we'll adjust our markers and do the necessary punch outs.
        this._loadedAlert.selectedStack.updateJSONAndCentroid();
        this._loadedAlert.selectedStack.punchOutShapes();
        this._loadedAlert.selectedStack.initializePolygonPathListeners(this._zoneToAdjust);
        this._loadedAlert.template.updateJSONAndCentroid();
        if (this._fallbackZone) {
            this._fallbackZone.punchOutOverlay();
        }
        this._previousY = this._y;
        // Adjust the map bounds while adjusting the size of the zone so the zone is always focused
        this._panToZone(this._zoneToAdjust);
    },

    /**
     * Listens for mouse clicks while the pointer is locked and exits pointer lock mode when encountered.
     * @private
     */
    _mouseClickListener: function() {
        document.exitPointerLock();
        // Adjust the map bounds after adjusting the size of the zone to ensure the zone is fully in view
        this._panToZone(this._zoneToAdjust, true);
    },

    /**
     * Binds various pointer lock related listeners so we can maintain a single reference to them and correct `this` scope.
     * @private
     */
    _bindPointerLockListeners: function() {
        if (!this._boundPointerLockChangeListener) {
            this._boundPointerLockChangeListener = this._pointerLockChangeListener.bind(this);
        }
        if (!this._boundMouseMoveListener) {
            this._boundMouseMoveListener = this._mouseMoveListener.bind(this);
        }
        if (!this._boundMouseClickListener) {
            this._boundMouseClickListener = this._mouseClickListener.bind(this);
        }
    },

    /**
     * Adjusts the size of the passed polygon paths to be smaller or larger based on the passed percentage.
     * @param paths
     * @param percentage
     * @param useOuterZoneOnly
     * @returns {google.maps.MVCArray}
     * @private
     */
    _adjustPathsByPercentage: function(paths,percentage,useOuterZoneOnly) {
        percentage = percentage / 100;
        var distance, bearing, newPath;
        var centroid = this._AlertTemplate.calculateCentroidFromPaths(paths);
        var limit = useOuterZoneOnly ? 1 : paths.length;
        for (var i=0; i<limit; i++) {
            newPath=[];
            for (var j=0; j<paths.getAt(i).length; j++) {
                //Calculate the distance and bearing from the center to each point.
                distance = google.maps.geometry.spherical.computeDistanceBetween(centroid,paths.getAt(i).getAt(j));
                bearing = google.maps.geometry.spherical.computeHeading(centroid,paths.getAt(i).getAt(j));
                //Increase the distance by the percentage to increase or decrease the area of the polygon the same.
                distance += distance * percentage;
                //Calculate the new coordinate.
                newPath.push(google.maps.geometry.spherical.computeOffset(centroid,distance,bearing));
            }
        }
        return new google.maps.MVCArray([new google.maps.MVCArray(newPath)])
    },

    /**
     * Enables pointer lock so the user can adjust the size of the zone.
     * @private
     */
    _adjustZoneSize: function(e) {
        this._zoneToAdjust = this._loadedAlert.selectedStack.getZoneAt(e.model.get('zoneIndex'));
        this._requestPointerLock();
    },

    /**
     * Returns whether we want to show the resizing button.
     * @param fromFile
     * @param editable
     * @returns {boolean}
     * @private
     */
    _showResizingButton: function(fromFile,editable) {
        return !fromFile && !editable;
    },

    /**
     * Returns whether we are currently showing the zone adjustment helper text.
     * @private
     */
    _showingAdjustmentHelperText: function(editable,isPointerLocked) {
        return editable || isPointerLocked;
    },

    /**
     * Validates the alert movement direction value and manages the value of the direction dropdown.
     * @private
     */
    _alertDirectionChanged: function() {
        if (!this._alertDirection && this._alertDirection !== 0) {
            //This prevents the user from typing the - character which is permitted for number fields.
            this._alertDirection = null;
            //When we have no alert direction reset the cardinal direction dropdown.
            var dropdown =  this.querySelector('#alertCardinalDirection');
            if (dropdown) {
                dropdown.selected = null;
            }
            return;
        }
        else if (this._alertDirection > 360) { //Force 360 max.
            this._alertDirection = 360;
            return;
        }
        else if (this._alertDirection < 0) { //Force 0 min.
            this._alertDirection = 0;
            return;
        }
        //If the direction was typed in manually then determine whether
        //we should select a cardinal direction in the dropdown.
        if (!this._alertDirectionSetFromCardinal) {
            for (var i=0; i<this._alertCardinalDirections.length; i++) {
                if (Number(this._alertDirection) === this._alertCardinalDirections[i].value) {
                    this.set('_alertCardinalDirection', this._alertCardinalDirections[i].value);
                    return;
                }
            }
            this.set('_alertCardinalDirection', null);
        }
        this._alertDirectionSetFromCardinal = false;
    },

    /**
     * Validates the alert movement speed value.
     * @private
     */
    _alertSpeedChanged: function() {
        if (!this._alertSpeed && this._alertSpeed !== 0) {
            //This prevents the user from typing the - character which is permitted for number fields.
            this._alertSpeed = null;
        }
        else if (this._alertSpeed > 500) { //Force 500 max.
            this._alertSpeed = 500;
        }
        else if (this._alertSpeed <= 0) { //Force 1 min.
            this._alertSpeed = 1;
        }
    },

    /**
     * Sets the direction input after selecting an item from the cardinal direction dropdown.
     * @private
     */
    _alertCardinalDirectionChanged: function() {
        var _this = this;
        //Since this fires on iron-activate we need to process it async so the value is current.
        setTimeout(function() {
            if (_this._alertCardinalDirection || _this._alertCardinalDirection === 0) {
                _this._alertDirectionSetFromCardinal = true;
                _this.set('_alertDirection',_this._alertCardinalDirection);
            }
        },0);
    },

    /**
     * Returns a displayable list of selected template categories.
     * @returns {string}
     * @private
     */
    _getReadableSelectedCategories: function() {
        if (!this._selectedCategories.length) {
            return 'None';
        }
        //Build a comma and space separated list of categories.
        var selectedCategories = this._selectedCategories.map(function(categoryObj) {
            return categoryObj.name;
        }).sort(this._sortCategories).toString().split(',').join(', ');
        //Return the selected category string, slicing off any trailing comma.
        return selectedCategories.charAt(selectedCategories.length-1) === ',' ?
            selectedCategories.slice(0,selectedCategories.length-2) :
            selectedCategories;
    },

    /**
     * Returns the classes for the dialog message p element.
     * @param showDialogInput
     * @param showDialogToggle
     * @param showDialogBadge
     * @returns {string}
     * @private
     */
    _getDialogMessageClasses: function(showDialogInput, showDialogToggle, showDialogBadge) {
        return !showDialogInput && !showDialogToggle && !showDialogBadge ? 'no-margin' : '';
    },

    /**
     * Returns the style classes for the accordion header and body elements.
     * @param section
     * @param active
     * @param extraClass
     * @returns {string}
     * @private
     */
    _getAccordionClasses: function(section,active,extraClass) {
        return (active ? (section+' active') : section) + ' ' + extraClass;
    },

    /**
     * Returns the style classes for the accordion stack elements.
     * @param zoneStack
     * @returns {string}
     * @private
     */
    _getAccordionStackClasses: function(zoneStack) {
        var classes = 'accordion stack';
        if (this._loadedAlert.template.zoneStacks.indexOf(zoneStack) === this._loadedAlert.template.zoneStacks.length -1) {
            classes += ' last';
        }
        return classes;
    },

    /**
     * Returns the style classes for the accordion zone label.
     * @param active
     * @param extraClass
     * @returns {string}
     * @private
     */
    _getZoneTitleClasses: function(active,extraClass) {
        return (active ? 'title zone active' : 'title zone') + ' ' + extraClass;
    }
});