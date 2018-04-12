Polymer({
    is: "voyent-alert-properties",
    behaviors: [Voyent.AlertBehaviour],

    properties: {
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
         * Indicates whether the alert zone name editing features should be hidden.
         */
        hideZoneNameEditing: { type: Boolean, value: false },
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
         * The list of available template categories.
         */
        _templateCategories: { type: Array, value: [], notify: true },
        /**
         * The list of selected categories for the current template.
         */
        _selectedCategories: { type: Array, value: [], notify: true },
        /**
         * Whether a template save is pending after we prompt the user for an uncategorized template before saving.
         */
        _templateSavePending: { type: Boolean, value: false, notify: true }
    },

    observers: [
        '_alertDirectionChanged(_alertDirection)',
        '_alertSpeedChanged(_alertSpeed)'
    ],

    attached: function() {
        this.querySelector('#newCategoryValidator').validate = this._validateNewTemplateCategory.bind(this);
        this.querySelector('#existingCategoryValidator').validate = this._validateExistingTemplateCategory.bind(this);
    },

    ready: function() {
        var _this = this;
        //JsColor uses a non-standard way of handling custom events so we must setup this listener on the window object.
        window._jsColorFineChange = function(colorPicker) {
            //Determine whether we have a regular zone or the fallback zone. If we have an index
            //it means the zone is part of the stack, otherwise it's the fallback zone.
            var zone = (colorPicker.targetElement.getAttribute('data-index') ?
                _this._loadedAlert.selectedStack.getZoneAt(colorPicker.targetElement.getAttribute('data-index')) :
                _this._fallbackZone);
            if (zone) {
                zone.setColour(colorPicker.toHEXString().slice(1));
            }
        };
        //Initialize various flags.
        this._renamingTemplate = false;
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
        //Flag indicating which category pane to display in the dialog, default is category selector.
        this._showCategoryManager = false;
    },

    /**
     * Opens and initializes the category management dialog.
     * @private
     */
    _manageCategories: function() {
        var _this = this;
        this._showCategoryManager = true;
        //If the update failed then open the dialog and do nothing else. This is so we don't overwrite the
        //categories the next time they open the editor, allowing them to go back in and try the save again.
        if (this._categoryUpdateFailed) {
            this._categoryUpdateFailed = false;
            return;
        }
        //Create a copy of our template categories list and ensure it is sorted.
        var templateCategories = this._templateCategories.slice(0);
        templateCategories.sort(this._sortCategories);
        //Build our list of categories to be used in the dialog with some extra properties for template binding.
        this.set('_editedTemplateCategories',templateCategories.map(function(category) {
            return {
                "name": category,
                "newName": '',
                "editing": false
            };
        }));
        //Ensure the dialog opens with a clean input state.
        this.set('_newTemplateCategory','');
        setTimeout(function() {
            _this.querySelector('#newCategoryInput').invalid = false;
        },0);
    },

    /**
     * Handles validating and adding a new template category.
     * @private
     */
    _addNewTemplateCategory: function() {
        if (!this.querySelector('#newCategoryInput').validate()) {
            return;
        }
        this.push('_editedTemplateCategories',{
            "name": this._newTemplateCategory,
            "newName": '',
            "editing": false
        });
        this.set('_newTemplateCategory','');
        //Sort the list and re-set it so the indices on the dom-repeat update. We do this
        //rather than using a dom-repeat sort because that sort does not update the indices.
        this._editedTemplateCategories.sort(this._sortCategories);
        this.set('_editedTemplateCategories',this._editedTemplateCategories.slice(0));
    },

    /**
     * Handles deleting an existing category and prompting the user if the category is associated with existing templates.
     * @param e
     * @private
     */
    _deleteCategory: function(e) {
        var _this = this;
        e.stopPropagation();
        this._categoryIndexToDelete = e.model.get('index');
        voyent.locate.findAlertTemplates({
            "query": {
                "properties.parentAlertId": { "$exists": false },
                "categories":this._editedTemplateCategories[this._categoryIndexToDelete].name
            }
        }).then(function(templates) {
            //If the category is associated with templates then prompt the user otherwise just confirm the removal.
            if (templates.length) {
                _this._associatedTemplates = templates;
                _this._openCategoryDeletionDialog();
            }
            else {
                _this._confirmCategoryDeletion();
            }
        }).catch(function () {
            _this.fire('message-error', 'Issue removing category, please try again.');
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
        var categoryToRemove = this._editedTemplateCategories[this._categoryIndexToDelete].name;
        var promises = [];
        for (var i=this._associatedTemplates.length-1; i>=0; i--) {
            (function(associatedTemplate) {
                //Remove the category from the template and update it.
                associatedTemplate.categories.splice(associatedTemplate.categories.indexOf(categoryToRemove),1);
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
            if (_this._associatedTemplates[i].length) {
                if (isRetry) {
                    _this.fire('Problem dissociating category from ' + _this._associatedTemplates[i].length + 'template(s), please contact an administrator.');
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
        //If we are currently editing the field that is being deleted then editing will be disabled automatically
        //when splicing so we must reset this property to indicate that we are no longer editing.
        if (this._editedTemplateCategories[this._categoryIndexToDelete].editing) {
            this._editingCategoryAtIndex = null;
        }
        this.splice('_editedTemplateCategories',this._categoryIndexToDelete,1);
        this._categoryIndexToDelete = null;
    },

    /**
     * Cancels template category deletion by closing the confirmation dialog.
     * @private
     */
    _cancelCategoryDeletion: function() {
        this._closeCategoryDeletionDialog();
    },

    /**
     * Opens a prompt during a deletion when the category being deleted is being used in templates.
     * @private
     */
    _openCategoryDeletionDialog: function() {
        var dialog = this.querySelector('#confirmCategoryDeletionDialog');
        if (dialog) {
            dialog.open();
        }
    },

    /**
     * Closes the prompt message displayed when the category being deleted is being used in templates.
     * @private
     */
    _closeCategoryDeletionDialog: function() {
        var dialog = this.querySelector('#confirmCategoryDeletionDialog');
        if (dialog) {
            dialog.close();
        }
    },

    /**
     * Enables category name editing when clicking on a category.
     * @param e
     * @private
     */
    _enableCategoryNameEditing: function(e) {
        e.stopPropagation();
        var _this = this;
        var index = e.model.get('index');
        //If we are already editing a category then don't allow the user to edit another one if validation is currently
        //failing. If validation is passing then just disable editing for the current field and proceed.
        if (typeof this._editingCategoryAtIndex === 'number' && !this._disableCategoryNameEditing(this._editingCategoryAtIndex,true)) {
            return;
        }
        this.set('_editedTemplateCategories.'+index+'.newName',_this._editedTemplateCategories[index].name);
        this.set('_editedTemplateCategories.'+index+'.editing',true);
        this._editingCategoryAtIndex = index;
        setTimeout(function() {
            _this.querySelector('#category-'+index).focus();
        },0);
    },

    /**
     * Disables category name editing at the specified index. If validation is currently failing then the operation will be aborted.
     * @param index
     * @param persist
     * @returns {boolean} - Whether the category name could successfully be disabled (validation passes).
     * @private
     */
    _disableCategoryNameEditing: function(index,persist) {
        if (this._categoryInputInvalid) {
            return false;
        }
        if (persist) {
            this.set('_editedTemplateCategories.'+index+'.name',this._editedTemplateCategories[index].newName);
        }
        //Reset the newName value so that when we set it again when enabling editing the set is reflected
        //in the view. Additionally, toggle a flag so the input change listener doesn't fire and try to validate.
        this._ignoreChangeEvent = true;
        this.set('_editedTemplateCategories.'+index+'.newName','');
        this._ignoreChangeEvent = false;
        this.set('_editedTemplateCategories.'+index+'.editing',false);
        this._editingCategoryAtIndex = null;
        return true;
    },

    /**
     * Saves changes in the category management dialog.
     * @private
     */
    _saveCategoryChanges: function() {
        var _this = this;
        //Toggle the category manager and reduce the category object list to a flat array of strings.
        this._showCategoryManager = false;
        var editedCategoryNames = this._editedTemplateCategories.map(function(obj) {
            return obj.name;
        });
        //If no changes were made then bail.
        if (editedCategoryNames.length === this._templateCategories.length &&
            editedCategoryNames.join(',') === this._templateCategories.join(',')) {
            this._categoriesSaved(editedCategoryNames);
            return;
        }
        //If the user deletes a selected category then we need to manually remove it from the selected entries list.
        for (var i=this._selectedCategories.length-1; i>=0; i--) {
            if (editedCategoryNames.indexOf(this._selectedCategories[i]) === -1) {
                this.splice('_selectedCategories',i,1);
            }
        }
        voyent.scope.createRealmData({data:{"templateCategories":editedCategoryNames}}).then(function() {
            _this._categoriesSaved(editedCategoryNames);
        }).catch(function() {
            _this.fire('message-error', 'Failed to update categories, please try again');
            _this._categoryUpdateFailed = true;
        });
    },

    /**
     * Triggered whenever the user confirms category changes, manages state.
     * @param editedCategoryNames
     * @private
     */
    _categoriesSaved: function(editedCategoryNames) {
        this.set('_templateCategories',editedCategoryNames);
        this.set('_editedTemplateCategories',[]);
    },

    /**
     * Reverts all changes made in the category management dialog.
     * @private
     */
    _cancelCategoryChanges: function() {
        this.set('_editedTemplateCategories',[]);
        this._showCategoryManager = false;
    },

    /**
     * Validates the new category input in the category management dialog.
     * @private
     */
    _validateNewTemplateCategory: function() {
        return this._validateCategory(
            this.querySelector('#newCategoryInput'),
            this._newTemplateCategory,
            null
        );
    },

    /**
     * Validates the existing category inputs in the category management dialog.
     * @private
     */
    _validateExistingTemplateCategory: function() {
        return this._validateCategory(
            this.querySelector('#category-'+this._categoryIndexBeingValidated),
            this._editedTemplateCategories[this._categoryIndexBeingValidated].newName,
            this._categoryIndexBeingValidated
        );
    },

    /**
     * Generic function to validate template categories.
     * @param categoryInput
     * @param categoryName
     * @param indexToSkip
     * @returns {boolean}
     * @private
     */
    _validateCategory: function(categoryInput,categoryName,indexToSkip) {
        if (!categoryName || !categoryName.trim().length) {
            categoryInput.setAttribute('error-message','Specify a category');
            return false;
        }
        for (var i=0; i<this._editedTemplateCategories.length; i++) {
            if (i === indexToSkip) { continue; }
            if (categoryName.toLowerCase() === this._editedTemplateCategories[i].name.toLowerCase()) {
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
    _validateCategoriesOnChange: function(e) {
        var _this = this;
        if (this._ignoreChangeEvent) { return; }
        //Async since this on-value-changed listener fires before the new value is reflected to the property.
        setTimeout(function() {
            _this._categoryIndexBeingValidated = e.model.get('index');
            _this._categoryInputInvalid = !_this.querySelector('#category-'+_this._categoryIndexBeingValidated).validate();
        },0);
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
                typeof _this._editingCategoryAtIndex === 'number') {
                _this._disableCategoryNameEditing(_this._editingCategoryAtIndex,true);
            }
        },150); //Delay for when a user clicks another category so we don't trigger the disable function
                // here, we will call this when enabling the new one in _enableCategoryNameEditing.
    },

    /**
     * Handles submitting an existing category input field on enter key presses and cancelling on escape key presses.
     * @param e
     * @private
     */
    _existingCategoryKeyup: function(e) {
        e.stopPropagation();
        var index = e.model.get('index');
        if (e.keyCode === 13) {
            this._disableCategoryNameEditing(index,true);
        }
        else if (e.keyCode === 27) {
            this._disableCategoryNameEditing(index,false);
        }
    },

    /**
     * Handles submitting the new category input field on enter key presses.
     * @param e
     * @private
     */
    _newCategoryKeyUp: function(e) {
        e.stopPropagation();
        if (e.keyCode === 13) {
            this._addNewTemplateCategory();
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
        if (a.name) {
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
     * Toggles renaming mode for an alert template.
     * @private
     */
    _toggleAlertTemplateRenaming: function() {
        var _this = this;
        this.set('_renamingTemplate',!this._renamingTemplate);
        if (this._renamingTemplate) {
            //Set the input to our current name value. We use a separate value for the input so we can easily revert.
            this.set('_templateNameVal',this._loadedAlert.template.name);
            //Focus on the input.
            setTimeout(function() {
                _this.querySelector('#alertTemplate').focus();
            },0);
        }
    },

    /**
     * Confirms or cancels the renaming of an alert template via enter and esc keys.
     * @param e
     * @private
     */
    _renameAlertTemplateViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13) { //Enter
            this._renameAlertTemplate();
        }
        else if (e.which === 27) { //Esc
            this._toggleAlertTemplateRenaming();
        }
    },

    /**
     * Confirms changes made to the alert template name when losing focus on the input.
     * @param e
     * @private
     */
    _renameAlertTemplateViaBlur: function(e) {
        var _this = this;
        //Always execute this function async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode. Additionally we'll check if we are in editing mode because if we are not
            //then it means that focus was removed via the Enter or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') === 'iron-input' ||
                !_this._renamingTemplate) {
                return;
            }
            _this._renameAlertTemplate();
        },0);
    },

    /**
     * Confirms the renaming of an alert template.
     * @private
     */
    _renameAlertTemplate: function() {
        if (this._templateNameVal.trim() &&
            this._templateNameVal !== this._loadedAlert.template.name) {
            this._loadedAlert.template.setName(this._templateNameVal);
            this.set('_templateNameVal','');
            this.fire('voyent-alert-template-name-changed', {"name": this._loadedAlert.template.name});
            //Toggle renaming mode.
            this._toggleAlertTemplateRenaming();
        }
    },

    /**
     * Toggles renaming mode for Proximity Zones.
     * @param eOrI - The event from the ui or the index from the JS.
     * @private
     */
    _toggleProximityZoneRenaming: function(eOrI) {
        //Prevent the event from bubbling.
        if (eOrI.stopPropagation) { eOrI.stopPropagation(); }
        var _this = this;
        //Determine whether we have a regular zone or the fallback zone. If we have a an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var i, zone;
        if ((eOrI.model && typeof eOrI.model.get('index') !== 'undefined') || typeof eOrI === 'number') {
            i = (typeof eOrI === 'number' ? eOrI : eOrI.model.get('index'));
            zone = this._loadedAlert.selectedStack.getZoneAt(i);
        }
        else {
            i = 'fallback';
            zone = this._fallbackZone;
        }
        zone.setRenaming(!zone.renaming);
        if (zone.renaming) {
            //Set the input to our current name value. We use a separate value for the input so we can easily revert.
            this.set('_zoneNameVal',zone.name);
            //Focus on the input.
            setTimeout(function() {
                _this.querySelector('#zone-'+i).focus();
            },0);
        }
        else {
            //Always reset the input value so it updates each time editing mode is entered
            this.set('_zoneNameVal','');
        }
    },

    /**
     * Confirms or cancels the renaming of a Proximity Zone via enter and esc keys.
     * @param e
     * @private
     */
    _renameProximityZoneViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13) { //Enter
            this._renameProximityZone(e);
        }
        else if (e.which === 27) { //Esc
            this._toggleProximityZoneRenaming(e);
        }
    },

    /**
     * Confirms changes made to the Proximity Zone name when losing focus on the input.
     * @param e
     * @private
     */
    _renameProximityZoneViaBlur: function(e) {
        var _this = this;
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = (e.model && typeof e.model.get('index') !== 'undefined' ?
                    this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
                    this._fallbackZone);
        //Always execute this function async so we can correctly determine the activeElement.
        setTimeout(function() {
            //Check if we are focused on an iron-input because if we are it means focus is still on the input so we
            //won't exit editing mode. Additionally we'll check if we are in editing mode because if we are not
            //then it means that focus was removed via the Enter or Esc key press and not just a regular blur.
            if (document.activeElement.getAttribute('is') === 'iron-input' ||
                  !zone.renaming) {
                return;
            }
            _this._renameProximityZone(e);
        },0);
    },

    /**
     * Confirms the renaming of a Proximity Zone.
     * @param e
     * @private
     */
    _renameProximityZone: function(e) {
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var i, zone;
        if (e.model && typeof e.model.get('index') !== 'undefined') {
            i = e.model.get('index');
            zone = this._loadedAlert.selectedStack.getZoneAt(i);
        }
        else {
            i = 'fallbackZone';
            zone = this._fallbackZone;
        }
        if (this._zoneNameVal.trim() && this._zoneNameVal !== zone.name) {
            zone.setName(this._zoneNameVal);
            this.set('_zoneNameVal','');
            this.fire('voyent-alert-zone-name-changed',{
                "id":zone.id,
                "name":zone.name,
                "isFallbackZone":i === 'fallbackZone'
            });
            //Redraw the overlay since the content changed.
            zone.nameOverlay.draw();
            //Toggle renaming mode.
            this._toggleProximityZoneRenaming(i);
        }
    },

    /**
     * Adds a new proximity zone to the alert template. The new zone is 50% larger than the largest existing zone.
     * @private
     */
    _addProximityZone: function() {
        var _this = this;
        var newZone, radius, paths;
        //Set the new zone radius as 50% larger than the current largest zone
        //and de-increment the new zone zIndex so it sits behind the other zones.
        var largestZone = _this._loadedAlert.selectedStack.getLargestZone();
        var zIndex = largestZone.zIndex - 1;
        //Since we don't support mix and match zone types within a stack just
        //check what the first one is to determine which kind we want to add.
        var shape = _this._loadedAlert.selectedStack.getZoneAt(0).getShape();
        //Check if the new zone will overlap another existing zone.
        if (shape === 'circle') {
            radius = this._adjustRadiusByPercentage(largestZone.shapeOverlay.getRadius(),50);
            if (this._alertHasIntersectingStacks('circle',{"center":largestZone.shapeOverlay.getCenter(),"radius":radius},_this._loadedAlert.selectedStack)) {
                this._displayStackOverlapMsg();
                return;
            }
        }
        else {
            paths = this._adjustPathsByPercentage(largestZone.shapeOverlay.getPaths(), 50, this._havePointerLock);
            if (this._alertHasIntersectingStacks('polygon', {"paths": paths},_this._loadedAlert.selectedStack)) {
                this._displayStackOverlapMsg();
                return;
            }
        }
        this._openDialog('Please enter the zone name','',null,false,false,function() {
            var name = this._dialogInput;
            if (shape === 'circle') {
                newZone = new _this._CircularAlertZone(null,radius,name,null,null,null,null,zIndex);
            }
            else { //polygon
                // Check if the outer line of each shape overlap each other. If they overlap then we are
                // unable to draw the shape and will instead draw a rectangle matching the bounds of it.
                var intersects = turf.lineIntersect({
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": _this._AlertTemplate.calculateCoordinatesFromPaths(paths)[0]
                        }
                    },
                    {
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": _this._AlertTemplate.calculateCoordinatesFromPaths(largestZone.shapeOverlay.getPaths())[0]
                        }
                });
                if (intersects.features.length) {
                    _this.fire('message-info','Unable to produce scaled polygon, drawing rectangle instead. Please modify as required');
                    paths = _this._getRectangularPathFromPolygonPath(paths.getAt(0));
                }
                //When we add a new zone we don't want to include the full shape so we can
                //punch it out properly later so just pass the filled outer shape via paths.getAt(0).
                newZone = new _this._PolygonalAlertZone(null,[paths.getAt(0)],name,null,null,null,null,zIndex);
            }
            _this._loadedAlert.selectedStack.addZone(newZone);
            //Re-adjust the centroid for the template.
            _this._loadedAlert.template.updateJSONAndCentroid();
            //Re-punch out the fallback zone.
            if (_this._fallbackZone) {
                _this._fallbackZone.punchOutOverlay();
            }
            _this.fire('voyent-alert-zone-added',{
                "id":newZone.id,"zone":newZone,
                "stack":_this._loadedAlert.selectedStack,
                "isFallbackZone":false
            });
            //Show the properties pane for the new zone.
            _this._toggleProperties(_this._loadedAlert.selectedStack.zones.length-1);
        });
    },

    /**
     * Removes the proximity zone from the alert template.
     * @private
     */
    _removeProximityZone: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        var zone = this._loadedAlert.selectedStack.getZoneAt(e.model.get('index'));
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
        this.fire('voyent-alert-zone-removed',{"id":id,"isFallbackZone":false});
    },

    /**
     * Removes the fallback zone entirely.
     * @private
     */
    _removeFallbackZone: function() {
        this._fallbackZone.removeFromMap();
    },

    /**
     * Confirms or cancels the edit of a Proximity Zone property via enter and esc keys.
     * @param e
     * @private
     */
    _editPropertyViaKeydown: function(e) {
        //Prevent the event from bubbling.
        e.stopPropagation();
        if (e.which === 13 || e.which === 27) { //Enter & Escape.
            this._editProperty(e);
            //Close the colour picker.
            if (e.target.getAttribute('data-property') === 'colour') {
                var index = e.model.get('index');
                //If we have a z-index it means the zone is part of the stack, otherwise it's the fallback zone.
                var jsColorId = '#jsColor-'+ (typeof index !== 'undefined' ? index : 'fallbackZone');
                var colorPicker = this.querySelector(jsColorId);
                if (colorPicker) {
                    colorPicker.jscolor.hide();
                }
            }
        }
    },

    /**
     * Confirms the edit of a Proximity Zone property.
     * @param e
     * @private
     */
    _editProperty: function(e) {
        //If we have a z-index it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = typeof e.model.get('index') !== 'undefined' ?
            this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
            this._fallbackZone;
        //The properties are set directly into the properties since they are bound
        //in the template but to apply the changes we need to call our set functions.
        if (e.target.getAttribute('data-property') === 'colour') {
            zone.setColour(zone.colour);
        }
        else if (e.target.getAttribute('data-property') === 'opacity') {
            zone.setOpacity(zone.opacity);
        }
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
        //Prevent the user from modifying the size of the shape so it extends into other zones in the stacks.
        //For circles we will just compare the radius but for polygons we will compare the areas and
        //then check for any intersections since the polygons in a stack can all be different shapes.
        var innerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)-1);
        var outerZone = this._loadedAlert.selectedStack.getZoneAt(this._loadedAlert.selectedStack.getZoneIndex(this._zoneToAdjust)+1);
        var newRadius, newPath, intersects, percentage=2;
        if (this._y <= this._previousY) { //The zone size is increasing
            if (this._zoneToAdjust.getShape() === 'circle') {
                newRadius = this._adjustRadiusByPercentage(this._zoneToAdjust.shapeOverlay.getRadius(),percentage);
                //If we are resizing the outer zone check if it overlaps another zone stack
                if (!outerZone && this._alertHasIntersectingStacks('circle',{"center":this._zoneToAdjust.shapeOverlay.getCenter(),"radius":newRadius},this._loadedAlert.selectedStack)) {
                    this._displayStackOverlapMsg();
                    this._y = this._previousY;
                    return;
                }
                //If we are resizing an inner zone check if it overlaps the next closest outer zone
                if (outerZone && newRadius >= outerZone.shapeOverlay.getRadius()) {
                    this._displayOverlapMsg();
                    this._y = this._previousY;
                    return;
                }
                this._zoneToAdjust.setRadius(newRadius);
            }
            else {
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
                        intersects = turf.lineIntersect({
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([newPath])
                                    )[0]
                                }
                            },
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([outerZonePath])
                                    )[0]
                                }
                            });
                        if (intersects.features.length) {
                            this._displayOverlapMsg();
                            this._y = this._previousY;
                            return;
                        }
                    }
                }
                else { //We are resizing an outer zone
                    //Check if it overlaps another zone stack
                    if (this._alertHasIntersectingStacks('polygon',{"paths":new google.maps.MVCArray([newPath])},this._loadedAlert.selectedStack)) {
                        this._displayStackOverlapMsg();
                        this._y = this._previousY;
                        return;
                    }
                }
                this._zoneToAdjust.setPaths([newPath]);
            }
        }
        else if (this._y > this._previousY) { //The zone size is decreasing
            if (this._zoneToAdjust.getShape() === 'circle') {
                newRadius = this._adjustRadiusByPercentage(this._zoneToAdjust.shapeOverlay.getRadius(),-percentage);
                //If we are resizing an outer zone check if it overlaps the next closest inner zone.
                if (innerZone && newRadius <= innerZone.shapeOverlay.getRadius()) {
                    this._displayOverlapMsg();
                    this._y = this._previousY;
                    return;
                }
                this._zoneToAdjust.setRadius(newRadius);
            }
            else {
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
                        intersects = turf.lineIntersect({
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([newPath])
                                    )[0]
                                }
                            },
                            {
                                "type": "Feature",
                                "geometry": {
                                    "type": "LineString",
                                    "coordinates": this._AlertTemplate.calculateCoordinatesFromPaths(
                                        new google.maps.MVCArray([innerZonePath])
                                    )[0]
                                }
                            });
                        if (intersects.features.length) {
                            this._displayOverlapMsg();
                            this._y = this._previousY;
                            return;
                        }
                    }
                }
                this._zoneToAdjust.setPaths([newPath]);
            }
        }
        //No failures so we'll adjust our markers and do the necessary punch outs.
        //For circles this occurs automatically in the `radius_changed` listener.
        if (this._zoneToAdjust.getShape() === 'polygon') {
            this._loadedAlert.selectedStack.updateJSONAndCentroid();
            this._loadedAlert.selectedStack.punchOutShapes();
            this._loadedAlert.selectedStack.initializePolygonPathListeners(this._zoneToAdjust);
            this._loadedAlert.template.updateJSONAndCentroid();
            if (this._fallbackZone) {
                this._fallbackZone.punchOutOverlay();
            }
        }
        this._previousY = this._y;
    },

    /**
     * Listens for mouse clicks while the pointer is locked and exits pointer lock mode when encountered.
     * @param e
     * @private
     */
    _mouseClickListener: function(e) {
        var _this = this;
        document.exitPointerLock();
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
     * Adjusts the passed radius to be smaller or larger based on the passed percentage.
     * @param radius
     * @param percentage
     * @returns {*}
     * @private
     */
    _adjustRadiusByPercentage: function(radius,percentage) {
        percentage = percentage / 100;
        return radius + radius * percentage;
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
        this._zoneToAdjust = this._loadedAlert.selectedStack.getZoneAt(e.model.get('index'));
        this._requestPointerLock();
    },

    /**
     * Triggered as the user is dragging the opacity slider.
     * @param e
     * @private
     */
    _immediateValueChange: function(e) {
        //Determine whether we have a regular zone or the fallback zone. If we have an index
        //it means the zone is part of the stack, otherwise it's the fallback zone.
        var zone = (e.model && typeof e.model.get('index') !== 'undefined' ?
            this._loadedAlert.selectedStack.getZoneAt(e.model.get('index')) :
            this._fallbackZone);
        if (zone) {
            if (e.target.getAttribute('data-property') === 'opacity') {
                zone.setOpacity(this._immediateValueOpacity);
            }
        }
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
        else if (this._alertDirection < 0) { //Force 0 min (this would only occur if they pasted in a negative value).
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
        else if (this._alertSpeed > 999) { //Force 999 max.
            this._alertSpeed = 999;
        }
        else if (this._alertSpeed < 0) { //Force 0 min (this would only occur if they pasted in a negative value).
            this._alertSpeed = 0;
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
        var toReturn = this._selectedCategories.sort(this._sortCategories).toString().split(',').join(', ');
        return toReturn || 'None';
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
     * Returns the style classes for the accordion zone label.
     * @param active
     * @param hideZoneNameEditing
     * @param extraClass
     * @returns {string}
     * @private
     */
    _getZoneTitleClasses: function(active,hideZoneNameEditing,extraClass) {
        var classes = (active ? 'title zone active' : 'title zone') + ' ' + extraClass;
        if (hideZoneNameEditing) {
            classes = classes + ' no-edit';
        }
        return classes;
    },

    /**
     * Returns the style classes for the zone title button wrapper.
     * @param hideZoneNameEditing
     * @returns {string}
     * @private
     */
    _getZoneTitleButtonClasses: function(hideZoneNameEditing) {
        var classes = 'title-bttns';
        if (hideZoneNameEditing) {
            classes = classes + ' no-edit';
        }
        return classes;
    },

    /**
     * Returns the arrow icon to use for each accordion.
     * @param active
     * @returns {string}
     * @private
     */
    _getArrowIcon: function(active) {
        return active ? 'expand-more' : 'expand-less';
    }
});