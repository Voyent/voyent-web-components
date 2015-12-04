Polymer({
	is: "bridgeit-action-editor",

    properties: {
        /**
         * Defines the BridgeIt account of the realm.
         * @default bridgeit.io.auth.getLastKnownAccount()
         */
        account: { type: String },
        /**
         * Defines the BridgeIt realm to build actions for.
         * @default bridgeit.io.auth.getLastKnownRealm()
         */
        realm: { type: String }
    },

    /**
     * Fired after the actions list is retrieved, this occurs on the initial load and whenever a CRUD operation is performed. Contains the list of saved actions.
     * @event actionsRetrieved
     */

	ready: function() {
        var _this = this;
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        if (bridgeit.io.auth.isLoggedIn()) {
            this.getActions();
            this.getTaskGroups();
            this.getTasks();
        }
        this._loadedAction = null;
        this._taskGroups = [];
        this._selectedEvents=[];
        this._events=[{event:'locationAdded',checked:false},{event:'locationChanged',checked:false},{event:'locationDeleted',checked:false},{event:'nearPointOfInterest',checked:false},{event:'enteredRegion',checked:false},{event:'exitedRegion',checked:false}];
        this._codeEditorProperties=['function','messagetemplate'];
        //keep a reference to the code editor change event listener function for 'removeEventListener'
        this._editorEventListener = function(e) {
            var editor = e.target;
            var groupIndex = editor.getAttribute('data-groupid').slice(-1);
            var taskIndex = editor.getAttribute('data-taskid').slice(-1);
            var propertyType = editor.getAttribute('data-propertytype');
            var propertyTitle = editor.getAttribute('data-propertytitle');
            var oneOfIndex = editor.getAttribute('data-oneofindex');
            var selector = '_taskGroups.'+groupIndex+'.tasks.'+taskIndex+'.schema.properties.'+propertyType;
            if (propertyType === 'oneOf') {
                selector = selector+'.'+oneOfIndex;
            }
            selector = selector+'.'+propertyTitle+'.value';
            _this.set(selector,editor.editor.getValue());
        };
	},

    /**
     * Fetch the list of available task groups from the Acton Service.
     */
    getTaskGroups: function() {
        var _this = this;
        bridgeit.io.action.getTaskGroups({"realm":this.realm}).then(function(schemas) {
            _this._processSchemas(schemas,'_taskGroupSchemas');
        }).catch(function(error) {
            console.log('Error in getTaskGroups:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Fetch the list of available tasks from the Acton Service.
     */
    getTasks: function() {
        var _this = this;
        bridgeit.io.action.getTasks({"realm":this.realm}).then(function(schemas) {
            _this._processSchemas(schemas,'_taskSchemas');
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
                if (!Array.isArray(actions)) {
                    actions = [actions];
                }
                _this._actionIds = actions.map(function(action) {
                    return action._id;
                });
            _this.fire('actionsRetrieved',{actions:actions});
            _this._getHandlers();
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
        var _this = this;
        this._loadHandler(action._id);
        this._loadedAction = JSON.parse(JSON.stringify(action));  //clone object (it is valid JSON so this technique is sufficient)
        this._taskGroups = this._convertActionToUI(this._loadedAction);
        this._setupCodeEditor(); //initialize code editor components
        //set the values from the action into the code editor in the UI
        setTimeout(function() {
            if (_this._editorMappings) {
                for (var i=0; i<_this._editorMappings.length; i++) {
                    var editor = Polymer.dom(_this.root).querySelector(_this._editorMappings[i].domSelector);
                    editor.editor.setValue(_this.get(_this._editorMappings[i].valueSelector),1);
                }
            }
        },0);
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
        action._id = actionId;
        bridgeit.io.action.createAction({"realm":this.realm,"id":actionId,"action":action}).then(function() {
            _this._loadedAction = action;
            _this.getActions(); //refresh actions list
            _this._saveHandler(actionId);
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
                _this._updateHandler(_this._actionId);
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
        var id = this._loadedAction._id;
        bridgeit.io.action.deleteAction({"realm":this.realm,id:id}).then(function() {
            _this.resetEditor();
            _this.getActions(); //refresh actions list
            _this._deleteHandler(id);
        }).catch(function(error) {
            console.log('Error in deleteAction:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    /**
     * Reset the editor.
     */
    resetEditor: function() {
        this._taskGroups = [];
        this._actionId = '';
        this._actionDesc = '';
        this._loadedAction = null;
        //reset event triggers
        this._selectedEvents=[];
        for (var i=0; i<this._events.length; i++) {
            this.set('_events.'+i+'.checked',false);
        }
    },

    /**
     * Validate the action against the task schemas.
     * @returns {boolean}
     */
    validateAction: function() {
        //validate required fields
        if (!this.$$('#actionForm').checkValidity()) {
            alert('Please enter all required fields.');
            return false;
        }
        var hasTasks = false;
        var taskGroupNames=[];
        for (var i=0; i<this._taskGroups.length; i++) {
            //make sure we have at least one task defined in each task group
            var tasks = this._taskGroups[i].tasks;
            if (tasks.length === 0) {
                continue;
            }
            hasTasks = true;
            //task group names need to be unique
            if (taskGroupNames.indexOf(this._taskGroups[i].name) > -1) {
                alert('Task group names must be unique, found duplicate name of "' + this._taskGroups[i].name +'".');
                return false;
            }
            taskGroupNames.push(this._taskGroups[i].name);
            var taskNames=[];
            for (var j=0; j<tasks.length; j++) {
                //task names need to be unique within the same task group
                if (taskNames.indexOf(tasks[j].name) > -1) {
                    alert('Task names must be unique within a task group, found duplicate name of "' + tasks[j].name +'" in "'+ this._taskGroups[i].name +'".');
                    return false;
                }
                taskNames.push(tasks[j].name);

                //pull out the values for the oneOf fields and group the values for each group together before processing
                var oneOfGroups;
                if (tasks[j].schema.properties.oneOf) {
                    oneOfGroups = tasks[j].schema.properties.oneOf.map(function(group) {
                        return this._toArray(group).map(function(property) {
                            return property.value;
                        });
                    }.bind(this));
                }
                if (!oneOfGroups) {
                    continue;
                }
                //validate oneOf
                var someGroupDefined=false;
                var allGroupDefined=false;
                for (var k=0; k<oneOfGroups.length; k++) {
                    var definedCount=0;
                    var propertyVal = oneOfGroups[k];
                    for (var l=0; l<propertyVal.length; l++) {
                        if (propertyVal[l] && propertyVal[l].trim().length > 0) {
                            definedCount++;
                        }
                    }
                    if (definedCount > 0) {
                        if (someGroupDefined) {
                            alert('You must define only one of the property groups in "' + this._taskGroups[i].name +'" > "' + tasks[j].name + '".');
                            return false;
                        }
                        someGroupDefined=true;
                        if (definedCount == propertyVal.length) {
                            allGroupDefined=true;
                        }
                    }
                }
                if (!allGroupDefined && someGroupDefined) {
                    alert('You must define all properties for the property group in "' + this._taskGroups[i].name +'" > "' + tasks[j].name + '".');
                    return false;
                }
                else if (!someGroupDefined) {
                    alert('You must define at least one of the property groups in "' + this._taskGroups[i].name +'" > "' + tasks[j].name + '".');
                    return false;
                }
            }
        }
        if (!hasTasks) {
            alert('You must define at least one task.');
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
        var taskGroups = JSON.parse(JSON.stringify(this._taskGroups)); //clone array (it is valid JSON so this technique is sufficient)
        for (var i=0; i<taskGroups.length; i++) {
            taskGroups[i].type = taskGroups[i].schema.title; //move title to type property
            (function(taskGroup) {
                this._processProperties(taskGroup.schema.properties,function(type,propName,property) {
                    //move the values of each property in the schema directly into the task group
                    if (typeof property.value !== 'undefined' && property.value.toString().trim().length > 0) {
                        taskGroup[property.title] = property.value;
                    }
                });
            }.bind(this))(taskGroups[i]);
            //cleanup values that aren't used in the action
            delete taskGroups[i].id;
            delete taskGroups[i].schema;

            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                tasks[j].params = {}; //create action params object
                tasks[j].type = tasks[j].schema.title; //move title to type property
                (function(task) {
                    this._processProperties(task.schema.properties,function(type,propName,property) {
                        //move the values of each property in the schema to the params object
                        if (typeof property.value !== 'undefined' && property.value.toString().trim().length > 0) {
                            task.params[property.title] = property.value;
                        }
                    });
                }.bind(this))(tasks[j]);
                //cleanup values that aren't used in the action
                delete tasks[j].id;
                delete tasks[j].schema;
            }
        }
        action.taskGroups = taskGroups;
        return action;
    },


    //******************PRIVATE API******************

    /**
     * Do some processing on the task group / task schemas so they can be used to easily render out the template.
     * @param schemas
     * @param key
     * @private
     */
    _processSchemas: function(schemas,key) {
        for (var i=0; i<schemas.length; i++) {
            //remove redundant '-taskgroup' and '-task' from task item label
            schemas[i].label = schemas[i].title.replace(/-taskgroup|-task/g,'');
            //do some pre-processing on the schema definition of oneOf properties
            var oneOfProps={};
            if (schemas[i].oneOf) {
                //collapse the oneOf properties into a single object with the
                //oneOf property as the key and the oneOf group # as the index
                for (var j=0; j<schemas[i].oneOf.length; j++) {
                    for (var k=0; k<schemas[i].oneOf[j].required.length; k++) {
                        oneOfProps[schemas[i].oneOf[j].required[k]] = j;
                    }
                }
            }
            var properties = schemas[i].properties;
            var isOptional;
            for (var prop in properties) {
                if (!properties.hasOwnProperty(prop)) {
                    continue;
                }
                if (this._codeEditorProperties.indexOf(prop.toLowerCase()) > -1) {
                    //quick way to check if we should add event listeners for code editors when dropping a new task
                    properties.hasCodeEditor = true;
                }
                isOptional=true;
                //add value directly to property in schema so it can be used for data binding
                if (properties[prop].type === 'string') {
                    //properties[prop].value = properties[prop].default ? properties[prop].default : '';
                    properties[prop].value = '';
                }
                else  if (properties[prop].type === 'boolean') {
                    //properties[prop].value = properties[prop].default ? properties[prop].default : false;
                    properties[prop].value = false;
                }

                //group the required properties under required object
                if (schemas[i].required && schemas[i].required.indexOf(prop) > -1) {
                    if (!properties.required) {
                        properties.required = {};
                    }
                    properties.required[prop] = properties[prop];
                    isOptional=false;
                }
                //group the oneOf properties under a oneOf array (so we can render the fieldset groups)
                if (oneOfProps.hasOwnProperty(prop)) {
                    if (!properties.oneOf) {
                        properties.oneOf = {};
                    }
                    if (!properties.oneOf[oneOfProps[prop]]) {
                        //use object initially so we are sure we place the oneOf properties into the correct groups
                        properties.oneOf[oneOfProps[prop]] = {};
                    }
                    properties[prop].oneOfGroupNum = oneOfProps[prop];
                    properties.oneOf[oneOfProps[prop]][prop] = properties[prop];
                    isOptional=false;
                }
                //group the optional properties under optional object
                if (isOptional) {
                    if (!properties.optional) {
                        properties.optional = {};
                    }
                    properties.optional[prop] = properties[prop];
                }
                delete properties[prop];
            }
            if (properties.oneOf) { //convert oneOf to array of objects, each object representing a oneOf group
                properties.oneOf = this._toArray(properties.oneOf);
            }
            //cleanup parts of schema we don't need
            delete schemas[i].$schema;
            delete schemas[i].type;
            delete schemas[i].required;
            delete schemas[i].oneOf;
        }
        //save modified schemas to _taskSchemas or _taskGroupSchemas
        this[key] = schemas;

        //map schema array to title property so we can easily find schemas later
        var schemaMap = {};
        schemas.forEach(function (schema) {
            schemaMap[schema.title] = schema;
        });
        //save schema mapping to _taskSchemasMap or _taskGroupSchemasMap
        this[key+'Map'] = schemaMap;
    },

    /**
     * Do some processing on the task group / task schema properties and return each property to the callback.
     * @param properties
     * @param cb
     * @private
     */
    _processProperties: function(properties,cb) {
        for (var type in properties) {
            if (!properties.hasOwnProperty(type)) {
                continue;
            }
            var typeGroup = properties[type];
            //we have an array if the typeGroup is "oneOf" so we'll collapse them into a single object before processing
            if (Array.isArray(typeGroup)) {
                var obj={};
                for (var l=0; l<typeGroup.length; l++) {
                    for (var prop in typeGroup[l]) {
                        if (typeGroup[l].hasOwnProperty(prop)) { obj[prop] = typeGroup[l][prop]; }
                    }
                }
                typeGroup = obj;
            }
            //return each property to the callback
            for (var propName in typeGroup) {
                if (!typeGroup.hasOwnProperty(propName)) {
                    continue;
                }
                cb(type,propName,typeGroup[propName]);
            }
        }
    },

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
            _this._deleteHandler(_this._loadedAction._id);
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
        var editorMappings=[];
        for (var i=0; i<taskGroups.length; i++) {
            //add uniqueID for drag/drop functionality
            taskGroups[i].id = 'taskGroup'+i;
            //add schema inside task group for mapping UI values
            taskGroups[i].schema = JSON.parse(JSON.stringify(this._taskGroupSchemasMap[taskGroups[i].type ? taskGroups[i].type : 'parallel-taskgroup'])); //clone object (it is valid JSON so this technique is sufficient)
            (function(i) {
                this._processProperties(taskGroups[i].schema.properties,function(type,propName,property) {
                    //move the task group properties to the value of each property in the schema
                    if (typeof taskGroups[i][property.title] !== 'undefined') {
                        property.value = taskGroups[i][property.title];
                        delete taskGroups[i][property.title]; //cleanup property since it's not used in UI
                    }
                });
            }.bind(this))(i);
            //cleanup type since it's not used in UI
            delete taskGroups[i].type;

            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                //add uniqueID for code editor functionality
                tasks[j].id = 'task'+j;
                //add schema inside task for mapping UI values
                tasks[j].schema = JSON.parse(JSON.stringify(this._taskSchemasMap[tasks[j].type])); //clone object (it is valid JSON so this technique is sufficient)
                (function(tasks,j,i) {
                    var _this = this;
                    this._processProperties(tasks[j].schema.properties,function(type,propName,property) {
                        //move the params values to the value of each property in the schema
                        if (tasks[j].params && typeof tasks[j].params[property.title] !== 'undefined') {
                            property.value = tasks[j].params[property.title];
                        }
                        //keep a map of code editor DOM locations and their value selectors so we can know where to put the values when loading the action
                        if (_this._codeEditorProperties.indexOf(propName.toLowerCase()) > -1) {
                            var selector = '_taskGroups.'+i+'.tasks.'+j+'.schema.properties.'+type;
                            if (type === 'oneOf') {
                                selector = selector+'.'+property.oneOfGroupNum;
                            }
                            selector = selector+'.'+propName+'.value';
                            editorMappings.push({domSelector:'#'+taskGroups[i].id+' #'+tasks[j].id + ' juicy-ace-editor',valueSelector:selector});
                        }
                    });
                }.bind(this))(tasks,j,i);
                //cleanup values that aren't used in the UI
                delete tasks[j].type;
                delete tasks[j].params;
            }
        }
        this._editorMappings = editorMappings;
        return taskGroups;
    },

    /**
     * Setup code editor inputs for certain properties.
     * @private
     */
    _setupCodeEditor: function() {
        var _this = this;
        //add event listener for function properties
        setTimeout(function() {
            var editors = Polymer.dom(_this.root).querySelectorAll('.code-editor');
            if (editors && editors.length > 0) {
                for (var i=0; i<editors.length; i++) {
                    var editor = editors[i];
                    editor.editor.$blockScrolling = Infinity; //disable console warning
                    if (editor.getAttribute('data-propertytitle').toLowerCase() === 'messagetemplate') {
                        //disable syntax checker for messageTemplate since the value can be a simple string
                        editor.editor.session.setOption("useWorker", false);
                    }
                    editor.removeEventListener('change',_this._editorEventListener);
                    editor.addEventListener('change',_this._editorEventListener);
                }
            }
        },0);
    },

    /**
     * Task group ondragstart event handler.
     * @param e
     * @private
     */
    _startDragGroup: function(e) {
        e.dataTransfer.setData('action/group', e.model.item); //indicate that this item is a task group
        this._lastDragged = e.model.item;//reference task group schema so we can populate the UI on drop
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
        var schema = JSON.parse(JSON.stringify(this._lastDragged)); //clone object (it is valid JSON so this technique is sufficient)
        this.push('_taskGroups',{"id":"taskGroup"+this._taskGroups.length,"schema":schema,"tasks":[]});
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
        var schema = JSON.parse(JSON.stringify(this._lastDragged)); //clone object (it is valid JSON so this technique is sufficient)
        var taskGroupIndex = e.target.id.slice(-1);
        var taskIndex = this._taskGroups[taskGroupIndex].tasks.length;
        this.push('_taskGroups.'+taskGroupIndex+'.tasks',{"id":"task"+taskIndex,"schema":schema});
        if (schema.properties.hasOwnProperty('hasCodeEditor')) {
            this._setupCodeEditor();
        }
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
        for (var i=this._taskGroups.length-1; i>=0; i--) {
            for (var j=this._taskGroups[i].tasks.length-1; j>=0; j--) {
                if (task == this._taskGroups[i].tasks[j]) {
                    this.splice('_taskGroups.'+i+'.tasks',j,1);
                }
                //must keep task IDs up to date for code editor functionality
                this.set('_taskGroups.'+i+'.tasks.'+j+'.id',"task"+j);
            }
        }
        //we initialize the editors again so we can properly map to the value property in the schema
        this._setupCodeEditor();
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
        //move the group up
        this.splice('_taskGroups',currPos,1);
        this.splice('_taskGroups',newPos,0,taskGroup);
        //keep the taskGroup IDs in sync
        this.set('_taskGroups.'+currPos+'.id','taskGroup'+currPos);
        this.set('_taskGroups.'+newPos+'.id','taskGroup'+newPos);
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
        //move the group down
        this.splice('_taskGroups',currPos,1);
        this.splice('_taskGroups',newPos,0,taskGroup);
        //keep the taskGroup IDs in sync
        this.set('_taskGroups.'+currPos+'.id','taskGroup'+currPos);
        this.set('_taskGroups.'+newPos+'.id','taskGroup'+newPos);
    },

    /**
     * Toggle the content of a task group / task.
     * @param e
     * @private
     */
    _toggleTask: function(e) {
        Polymer.dom(e.target).parentNode.classList.toggle('toggled');
        Polymer.dom(e.target).parentNode.querySelector('.content').classList.toggle('toggled');
        Polymer.dom(e.target).querySelector('.arrow').classList.toggle('toggled');
    },

    /**
     * Sorts the list of task items alphabetically.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortTaskItems: function(a,b) {
        a = a.title.toLowerCase();
        b = b.title.toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    },

    /**
     * Sorts the list of properties alphabetically.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortProperties: function(a,b) {
        a = a.title.toLowerCase();
        b = b.title.toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    },

    /**
     * Template helper function.
     * @param properties
     * @returns {Array}
     * @private
     */
    _toArray: function(properties) {
        if (!properties) {
            return [];
        }
        return Object.keys(properties).map(function(key) {
            return properties[key];
        });
    },

    /**
     * Template helper function.
     * @param index
     * @private
     */
    _toOneBasedIndex: function(index) {
        return index+1;
    },

    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isString: function(type) {
        return type=='string';
    },

    /**
     * Template helper function.
     * @param type
     * @returns {boolean}
     * @private
     */
    _isBoolean: function(type) {
        return type=='boolean';
    },

    /**
     * Template helper function.
     * @param title
     * @returns {boolean}
     * @private
     */
    _isCodeEditor: function(title) {
        return this._codeEditorProperties.indexOf(title.toLowerCase()) > -1;
    },

    //event handler functions

    /**
     * Toggles selection of an event trigger.
     * @param e
     * @private
     */
    _toggleEvent: function(e) {
        if (!e.model.item.checked) { //this listener fires before checked is changed to true
            this._selectedEvents.push(e.model.item.event);
            return;
        }
        this._selectedEvents.splice(this._selectedEvents.indexOf(e.model.item.event),1);
    },

    /**
     * Sorts the list of event triggers alphabetically.
     * @param a
     * @param b
     * @returns {number}
     * @private
     */
    _sortEventList: function(a,b) {
        a = a.event.toLowerCase();
        b = b.event.toLowerCase();
        if (a < b) { return -1; }
        else if (a > b) { return  1; }
        return 0;
    },

    _getHandlers: function() {
        var _this = this;
        bridgeit.io.eventhub.findHandlers({"realm":this.realm}).then(function(handlers) {
            var handlerMap = {};
            if (handlers) {
                if (Array.isArray(handlers)) {
                    handlers.forEach(function (handler) {
                        handlerMap[handler._id] = handler;
                    });
                }
                else {
                    handlerMap[handlers._id] = handlers;
                }
            }
            _this._handlers = handlerMap;
        }).catch(function(error) {
            console.log('Error in getHandlers:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    _convertUIToHandler: function() {
        return {
            "events":this._selectedEvents,
            "actionId":this._actionId,
            "actionParams":{}
        };
    },

    _loadHandler: function(id) {
        id = id + '_handler';
        var handler = this._handlers[id];
        this._selectedEvents = handler && handler.events ? handler.events : [];
        for (var i=0; i<this._events.length; i++) {
            if (this._selectedEvents.indexOf(this._events[i].event) > -1) {
                this.set('_events.'+i+'.checked',true);
                continue;
            }
            this.set('_events.'+i+'.checked',false);
        }
    },

    _saveHandler: function(id) {
        var _this = this;
        var handler = this._convertUIToHandler();
        id = id+'_handler';
        var func = 'createHandler';
        if (this._handlers[id]) {
            func = 'updateHandler';
        }
        bridgeit.io.eventhub[func]({"realm":this.realm,"id":id,"handler":handler}).then(function(uri) {
        }).catch(function(error) {
            console.log('Error in saveHandler:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    _updateHandler: function(id) {
        var _this = this;
        var handler = this._convertUIToHandler();
        id = id+'_handler';
        var func = 'updateHandler';
        if (!this._handlers[id]) {
            func = 'createHandler';
        }
        bridgeit.io.eventhub[func]({"realm":this.realm,"id":id,"handler":handler}).then(function(uri) {
        }).catch(function(error) {
            console.log('Error in updateHandler:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    _deleteHandler: function(id) {
        var _this = this;
        id = id+'_handler';
        if (!this._handlers[id]) {
            return;
        }
        bridgeit.io.eventhub.deleteHandler({"realm":this.realm,"id":id}).then(function() {
        }).catch(function(error) {
            console.log('Error in deleteHandler:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    }
});