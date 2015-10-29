Polymer({
	is: "bridgeit-action-editor",

    properties: {
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String, value: bridgeit.io.auth.getLastKnownAccount() },
        /**
         * Defines the BridgeIt realm to build actions for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String, value: bridgeit.io.auth.getLastKnownRealm() }
    },

    /**
     * Fired after the actions list is retrieved, this occurs on the initial load and whenever a CRUD operation is performed. Contains the list of saved actions.
     * @event actionsRetrieved
     */

	ready: function() {
        if (bridgeit.io.auth.isLoggedIn()) {
            this.getActions();
            this.getTasks();
        }
        this._loadedAction = null;
        this._taskGroups = [{"id":"taskGroup0","tasks":[]}]; //initialize with one group by default
	},

    /**
     * Fetch the list of available tasks from the Acton Service.
     */
    getTasks: function() {
        var _this = this;
        bridgeit.io.action.getTasks({"realm":this.realm}).then(function(schemas) {
            for (var i=0; i<schemas.length; i++) {
                var properties = schemas[i].properties;
                for (var prop in properties) {
                    if (!properties.hasOwnProperty(prop)) {
                        continue;
                    }
                    //add required directly to property in schema so it can be used in template
                    if (schemas[i].required.indexOf(prop) > -1) {
                        properties[prop].required = true;
                    }
                    //set the value of any token properties
                    if (properties[prop].title == 'token') {
                        properties[prop].value = bridgeit.io.auth.getLastAccessToken();
                    }
                }
            }
            _this._schemas = schemas;
            //map schema array to title property so we can easily find schemas later
            var schemaMap = {};
            schemas.forEach(function (schema) {
                schemaMap[schema.title] = schema;
            });
            _this._schemaMap = schemaMap;
        }).catch(function(error) {
            console.log('Error in getTasks:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Fetch the list of previously created actions.
     */
    getActions: function() {
        var _this = this;
        bridgeit.io.action.findActions({"realm":this.realm}).then(function(actions) {
            //save the list of action IDs so we can check for uniqueness
            _this._actionIds = actions.map(function(action) {
                return action._id;
            });
            _this.fire('actionsRetrieved',{actions:actions});
        }).catch(function(error) {
            console.log('Error in getActions:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Load an action into the editor from JSON format.
     * @param action
     */
    loadAction: function(action) {
        this._loadedAction = JSON.parse(JSON.stringify(action)); //deep copy object (quick and dirty)
        this._taskGroups = this._convertActionToUI(this._loadedAction);
    },

    /**
     * Save a new action. Provide an id to override the value specified in the UI.
     * @param actionId
     */
    saveAction: function(actionId) {
        var _this = this;
        actionId = actionId && actionId.trim().length > 0 ? actionId : this._actionId;
        if (!this.validateAction() || !this.isUniqueActionId(actionId)) {
            return;
        }
        var action = this.convertUIToAction();
        bridgeit.io.action.createAction({"realm":this.realm,"id":actionId,"action":action}).then(function() {
            _this._loadedAction = action;
            _this.getActions(); //refresh actions list
        }).catch(function(error) {
            console.log('Error in saveAction:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Overwrite a previously saved action.
     */
    updateAction: function() {
        var _this = this;
        if (!this._loadedAction || !this.validateAction()) {
            return;
        }
        //check if the id has changed, if it has we must re-create the action with the new id
        if (this._actionId != this._loadedAction._id) {
            this._deleteAndSaveAction();
        }
        else {
            var action = this.convertUIToAction();
            bridgeit.io.action.updateAction({"realm":this.realm,"id":this._actionId,"action":action}).then(function() {
                _this.getActions(); //refresh actions list
            }).catch(function(error) {
                console.log('Error in updateAction:',error);
                _this.fire('bridgeit-error', {error: error});
            });
        }
    },

    /**
     * Delete the action from the Action Service.
     */
    deleteAction: function() {
        var _this = this;
        if (!this._loadedAction || !this._loadedAction._id) {
            return;
        }
        bridgeit.io.action.deleteAction({"realm":this.realm,id:this._loadedAction._id}).then(function() {
            _this.resetEditor();
            _this.getActions(); //refresh actions list
        }).catch(function(error) {
            console.log('Error in deleteAction:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Reset the editor.
     */
    resetEditor: function() {
        this._taskGroups = [{"id":"taskGroup0","tasks":[]}];
        this._actionId = '';
        this._actionDesc = '';
        this._loadedAction = null;
    },

    /**
     * Validate the action against the task schemas.
     * @returns {boolean}
     */
    validateAction: function() {
        //make sure we have at least one task defined
        var haveTasks = false;
        for (var i=0; i<this._taskGroups.length; i++) {
            if (this._taskGroups[i].tasks.length > 0) {
                haveTasks = true;
                break;
            }
        }
        if (!haveTasks) {
            alert('You must define at least one task.');
            return false;
        }
        //validate required fields
        if (!this.$$('#actionForm').checkValidity()) {
            alert('Please enter all required fields.');
            return false;
        }
        return true;
    },

    /**
     * Check if the id is unique.
     * @param actionId
     * @returns {boolean}
     */
    isUniqueActionId: function(actionId) {
        if (this._actionIds.indexOf(actionId) > -1) {
            alert('This Action ID is already in use, please try a different one.');
            return false;
        }
        return true;
    },

    /**
     * Convert the editor state into a JSON action.
     * @returns {{}}
     */
    convertUIToAction: function() {
        var action = {"_id": this._actionId};
        if (this._actionDesc && this._actionDesc.trim().length > 0) {
            action.desc = this._actionDesc;
        }
        var taskGroups = JSON.parse(JSON.stringify(this._taskGroups)); //deep copy array (quick and dirty)
        for (var i=0; i<taskGroups.length; i++) {
            delete taskGroups[i].id; //remove id used by template
            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                var properties = tasks[j].schema.properties;
                tasks[j].params = {}; //create action params object
                tasks[j].type = tasks[j].schema.title; //move title to type property
                for (var prop in properties) {
                    if (!properties.hasOwnProperty(prop)) {
                        continue;
                    }
                    if (typeof properties[prop].value !== 'undefined' && properties[prop].value.toString().trim().length > 0) {
                        tasks[j].params[properties[prop].title] = properties[prop].value; //move value to params object
                    }
                }
                delete tasks[j].schema; //remove schema reference used by ui template
            }
        }
        action.taskGroups = taskGroups;
        return action;
    },


    //******************PRIVATE API******************


    /**
     * Wrapper for `saveAction()`.
     * @private
     */
    _saveAction: function() {
        this.saveAction();
    },

    /**
     * Wrapper for `updateAction()`.
     * @private
     */
    _updateAction: function() {
        this.updateAction();
    },

    /**
     * Wrapper for `saveAction()`. Prompts for a new id to use for the cloned action.
     * @private
     */
    _cloneAction: function() {
        var actionId = window.prompt("Please enter the new action name");
        if (actionId === null) {
            return;
        }
        this.saveAction(actionId);
    },

    /**
     * Wrapper for `deleteAction()`. Adds a confirm dialog.
     * @private
     */
    _deleteAction: function() {
        var confirm = window.confirm("Are you sure? This cannot be undone!");
         if (!confirm) {
         return;
         }
        this.deleteAction();
    },

    /**
     * Update an existing action when the id changes.
     * @private
     */
    _deleteAndSaveAction: function() {
        var _this = this;
        bridgeit.io.action.deleteAction({"realm":this.realm,id:this._loadedAction._id}).then(function() {
            _this._loadedAction._id = _this._actionId;
            _this.saveAction();
        }).catch(function(error) {
            console.log('Error in updateAction:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Wrapper for `resetEditor()`.
     * @private
     */
    _resetEditor: function() {
        this.resetEditor();
    },

    /**
     * Convert an action from JSON format to a form that the UI can render.
     * @param action
     * @returns {{}}
     */
    _convertActionToUI: function(action) {
        //move action id and description to inputs
        this._actionId = action._id;
        this._actionDesc = action.desc && action.desc.trim().length > 0 ? action.desc : '';
        var taskGroups = action.taskGroups;
        for (var i=0; i<taskGroups.length; i++) {
            //add uniqueID for drag/drop functionality
            taskGroups[i].id = 'taskGroup'+i;
            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                //add schema inside task for mapping UI values
                tasks[j].schema = JSON.parse(JSON.stringify(this._schemaMap[tasks[j].type])); //deep copy object (quick and dirty)
                //move the params values to the value of each property in the schema
                var params = tasks[j].params;
                var properties = tasks[j].schema.properties;
                for (var prop in properties) {
                    if (!properties.hasOwnProperty(prop)) {
                        continue;
                    }
                    if (typeof params[properties[prop].title] !== 'undefined') {
                        properties[prop].value = params[properties[prop].title];
                    }
                }
                //cleanup values that aren't used in the UI
                delete tasks[j].type;
                delete tasks[j].params;
            }
        }
        return taskGroups;
    },

    /**
     * Task group ondragstart event handler.
     * @param e
     * @private
     */
    _startDragGroup: function(e) {
        e.dataTransfer.setData('action/group', true); //indicate that this item is a task group
        this._lastDragged = null;
    },

    /**
     * Task ondragstart event handler.
     * @param e
     * @private
     */
    _startDragTask: function(e) {
        e.dataTransfer.setData('action/task', e.model.item); //indicate that this item is a task
        this._lastDragged = e.model.item; //reference task schema so we can populate the UI on drop
    },

    /**
     * Action ondragover event handler.
     * @param e
     * @private
     */
    _dragOverAction: function(e) {
        if (e.dataTransfer.types.indexOf('action/group') > -1) {
            e.preventDefault(); //only allow task groups to be dragged into the container
        }
    },

    /**
     * Task group ondragover event handler.
     * @param e
     * @private
     */
    _dragOverGroup: function(e) {
        if (e.dataTransfer.types.indexOf('action/task') > -1) {
            e.preventDefault(); //only allow tasks to be dragged into the task groups
        }
    },

    /**
     * Action ondrop event handler.
     * @param e
     * @private
     */
    _dropInAction: function(e) {
        e.preventDefault();
        //only allow task groups to be dropped inside actions
        if (!e.dataTransfer.getData('action/group')) { e.stopPropagation(); return; }
        //add new task group
        this.push('_taskGroups',{"id":"taskGroup"+this._taskGroups.length,"tasks":[]});
    },

    /**
     * Task group ondrop event handler.
     * @param e
     * @private
     */
    _dropInGroup: function(e) {
        e.preventDefault();
        //only allow tasks to be dropped inside task groups
        if (!e.dataTransfer.getData('action/task')) { e.stopPropagation(); return; }
        //add new task (with schema reference) to task group
        var schema = this._lastDragged;
        this.push('_taskGroups.'+e.target.id.slice(-1)+'.tasks',{"schema":schema});
    },

    /**
     * Misc ondrop event handler for preventing drops.
     * @param e
     * @private
     */
    _preventDrop: function(e) {
        e.stopPropagation();
    },

    /**
     * Delete a task group.
     * @param e
     * @private
     */
    _deleteTaskGroup: function(e) {
        var groupId = e.model.group.id;
        for (var i=this._taskGroups.length-1; i>=0; i--) {
            if (this._taskGroups[i].id == groupId) {
                this.splice('_taskGroups',i,1);
            }
            //must keep the taskGroup IDs up to date for drag/drop functionality
            this.set('_taskGroups.'+i+'.id','taskGroup'+i);
        }
    },

    /**
     * Delete a task.
     * @param e
     * @private
     */
    _deleteTask: function(e) {
        var task = e.model.task;
        for (var i=0; i<this._taskGroups.length; i++) {
            for (var j=0; j<this._taskGroups[i].tasks.length; j++) {
                if (task == this._taskGroups[i].tasks[j]) {
                    this.splice('_taskGroups.'+i+'.tasks',j,1);
                    return;
                }
            }
        }
    },

    /**
     * Move a task group up.
     * @param e
     * @private
     */
    _moveTaskGroupUp: function(e) {
        var taskGroup = e.model.group;
        var currPos = this._taskGroups.indexOf(taskGroup);
        var newPos = currPos-1;
        if (newPos < 0) {
            return;
        }
        this.splice('_taskGroups',currPos,1);
        this.splice('_taskGroups',newPos,0,taskGroup);
    },

    /**
     * Move a task group down.
     * @param e
     * @private
     */
    _moveTaskGroupDown: function(e) {
        var taskGroup = e.model.group;
        var currPos = this._taskGroups.indexOf(taskGroup);
        var newPos = currPos+1;
        if (newPos == this._taskGroups.length) {
            return;
        }
        this.splice('_taskGroups',currPos,1);
        this.splice('_taskGroups',newPos,0,taskGroup);
    },

    /**
     * Toggle the content of a task group.
     * @param e
     * @private
     */
    _toggleTaskGroup: function(e) {
        //find the task-group that we toggled
        var parent = Polymer.dom(e.target).parentNode;
        while (!parent.classList.contains('task-group')) {
            parent = Polymer.dom(parent).parentNode;
        }
        parent.classList.toggle('hidden');
        parent.querySelector('.content').classList.toggle('hidden');
        parent.querySelector('.arrow').classList.toggle('toggled');
    },

    /**
     * Toggle the content of a task.
     * @param e
     * @private
     */
    _toggleTask: function(e) {
        Polymer.dom(e.target).parentNode.classList.toggle('hidden');
        Polymer.dom(e.target).parentNode.querySelector('.content').classList.toggle('hidden');
        Polymer.dom(e.target).querySelector('.arrow').classList.toggle('toggled');
    },

    /**
     * Template helper function.
     * @param properties
     * @returns {Array}
     * @private
     */
    _toArray: function(properties) {
        return Object.keys(properties).map(function(key) {
            return properties[key];
        });
    },

    /**
     * Template helper function
     * @param type
     * @returns {boolean}
     * @private
     */
    _isString: function(type) {
        return type=='string';
    }
});