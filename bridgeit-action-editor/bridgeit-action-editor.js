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
        realm: { type: String },
        /**
         * Defines how much top padding (without units) we want for the sidebar (containing actions / tasks)
         * This is because the sidebar will "sticky scroll" to always be in view
         * But we might have an absolutely positioned header or similar that we want to account for
         */
        barpad: { type: Number, value: 0, reflectToAttribute: true, notify: true }
    },

    /**
     * Fired after the actions list is retrieved, this occurs on the initial load and whenever a CRUD operation is performed. Contains the list of saved actions.
     * @event actionsRetrieved
     */
	ready: function() {
        if (!this.realm) {
            this.realm = bridgeit.io.auth.getLastKnownRealm();
        }
        if (!this.account) {
            this.account = bridgeit.io.auth.getLastKnownAccount();
        }
        if (bridgeit.io.auth.isLoggedIn()) {
            this.getTaskItems();
            this.getActions();
        }
        this._loadedAction = null;
        this._taskGroups = [];
        this._codeEditorProperties=['function','messagetemplate'];
        
        // Setup our sidebar to scroll alongside the action editor
        // This is necessary in case the action editor is quite long (such as many tasks)
        // Because we still want to see the draggable containers/tasks list
        this.offset = -1;
        var _this = this;
        window.addEventListener("scroll", function() {
            var ourDiv = document.getElementById("fixedDiv");
            
            if (ourDiv) {
                // Set our component offset if we haven't already
                if (_this.offset < 0) {
                    _this.offset = ourDiv.offsetTop;
                }
                
                // Normally we can just use the document "scrollTop" (via a few browser compatible ways)
                // But there is a chance our component will be used inside a scrollable container
                // In that case we need to get the scrollTop of any valid parent container
                // So basically if we can't get the scrollTop a normal way, we reverse traverse the
                //  parent nodes until we find a valid scrollTop, or hit the top of the document (when parentNode = null)
                var compareTop = (document.documentElement.scrollTop || document.body.scrollTop);
                if (compareTop <= 0) {
                    var currentNode = ourDiv.parentNode;
                    while (currentNode !== null) {
                        if (currentNode.scrollTop > 0) {
                            compareTop = currentNode.scrollTop;
                            break;
                        }
                        currentNode = currentNode.parentNode;
                    }
                }
                
                // If the top of our scroll is beyond the sidebar offset it means
                //  the sidebar would no longer be visible
                // At that point we switch to a fixed position with a top of 0
                // We will reverse this process if the sidebar would naturally be visible again
                // This is necessary beyond a standard "position: fixed" to ensure the sidebar doesn't
                //  stay fixed to the top of the page when it doesn't need to
                // Note we include our "barpad" attribute, to ensure the shifting happens right away
                if ((compareTop+_this.barpad) > _this.offset) {
                    ourDiv.style.position = 'fixed';
                    ourDiv.style.top = _this.barpad + 'px';
                }
                else {
                    ourDiv.style.position = 'relative';
                    ourDiv.style.top = null;
                }
            }
        }, true);
	},

    /**
     * Fetch the list of available task groups and tasks from the Acton Service.
     */
    getTaskItems: function() {
        var _this = this;
        var promises = [];
        promises.push(bridgeit.io.action.getTaskGroups({"realm":this.realm}).then(function(schemas) {
            _this._processSchemas(schemas,'_taskGroupSchemas');
        }));
        promises.push(bridgeit.io.action.getTasks({"realm":this.realm}).then(function(schemas) {
            var key = '_taskSchemas';
            _this._processSchemas(schemas,key);
            
            // We also want to group/organize the tasks
            // Unfortunately we have to hardcode some of the services here until the meta is updated
            // We use a separate map for this so we don't interfere with existing functionality, just the display on the page
            _this._organizeSchemas(_this[key],key);
        }));
        return Promise.all(promises).then(function(){
            _this._loadQueryEditor();
        })['catch'](function(error) {
            console.log('Error in getTaskItems:',error);
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
        this._loadHandler(action._id);
        this._loadedAction = JSON.parse(JSON.stringify(action));  //clone object (it is valid JSON so this technique is sufficient)
        this._taskGroups = this._convertActionToUI(this._loadedAction);
        //hack way to get any select components in the action to properly select the loaded value
        setTimeout(function() {
            this.set('_taskGroups',JSON.parse(JSON.stringify(this._taskGroups)));
        }.bind(this),0);
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
        this._queryEditorRef.resetEditor();
        this._handlerIsActive = false;
    },

    /**
     * Validate the action against the task schemas.
     * @returns {boolean}
     */
    validateAction: function() {
        //validate handler query
        if (!this._queryEditorRef.validateQuery()) {
            alert('Please enter a valid query.');
            return false;
        }
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
     * An additional step of processing for task schemas specific to the UI
     * For readability we want to group the tasks into a few service groups
     * This is done purely for the UI, so we still back the template with our core schemas created in processSchemas
     * @param schemas
     * @param key
     * @private
     */
    _organizeSchemas: function(schemas,key) {
        // We use 4 hardcoded services to sort: doc, locate, mailbox, user
        // Anything else goes into misc
        var defaultService = 'misc';
        var serviceArray = [ { label: 'doc', schemas: [] },
                             { label: 'locate', schemas: [] },
                             { label: 'mailbox', schemas: [] },
                             { label: 'user', schemas: [] },
                             { label: defaultService, schemas: [] } ];
        
        // Loop through the passed list of schemas, which would be the tasks
        for (var i=0; i<schemas.length; i++) {
            var currentSchema = schemas[i];
            var hasMatch = false;
            
            // For each schema we want to find if it matches a service
            // If not we'll default to using the "misc" group
            for (var s=0; s<serviceArray.length; s++) {
                if (currentSchema.label.startsWith(serviceArray[s].label)) {
                    hasMatch = true;
                    
                    // Add a UI label that removes the group name from the label
                    // For example locate-dir just becomes dir
                    // We can fairly safely assume there will be a dash in the service name, but we double check just in case
                    if (currentSchema.label.indexOf('-') > -1) {
                        currentSchema.labelUI =
                            currentSchema.label.substring(
                                currentSchema.label.indexOf(serviceArray[s].label + '-')+serviceArray[s].label.length+1);
                    }
                    else {
                        currentSchema.labelUI =
                            currentSchema.label.substring(
                                currentSchema.label.indexOf(serviceArray[s].label)+serviceArray[s].label.length);
                    }
                    
                    // Add the modified schema to our service array for use in the UI
                    serviceArray[s].schemas.push(currentSchema);
                    
                    break;
                }
            }
            
            // If we don't have a match just add to our "misc" service group
            if (!hasMatch) {
                for (var j=0; j<serviceArray.length; j++) {
                    if (serviceArray[j].label === defaultService) {
                        // Duplicate our unformatted label into labelUI
                        currentSchema.labelUI = currentSchema.label;
                        
                        serviceArray[j].schemas.push(currentSchema);
                        break;
                    }
                }
            }
        }
        
        // We store this UI specific list of schemas in an appropriately named map
        // This map will then be used in a template
        this[key+'UI'] = serviceArray;
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
     * Initialize the query editor for building event handlers.
     * @private
     */
    _loadQueryEditor: function() {
        var _this = this;
        //only render the query editor once
        if (Polymer.dom(this.$$('#eventHandlerEditor')).querySelector('bridgeit-query-editor')) {
            return;
        }
        this._queryEditorRef = new BridgeIt.QueryEditor(this.account,this.realm,'metrics','events',null,{"limit":100,"sort":{"time":-1}},null);
        //since the editor div is included dynamically in the
        //template it's possible that it hasn't rendered yet
        var checkExist = setInterval(function() {
            if (_this.$$('#eventHandlerEditor')) {
                _this.$$('#eventHandlerEditor').appendChild(_this._queryEditorRef);
                clearInterval(checkExist);
            }
        },50);
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
        var _this = this;
        //move action id and description to inputs
        this._actionId = action._id;
        this._actionDesc = action.desc && action.desc.trim().length > 0 ? action.desc : '';
        var taskGroups = action.taskGroups;
        for (var i=0; i<taskGroups.length; i++) {
            //add uniqueID for drag/drop functionality
            taskGroups[i].id = 'taskGroup'+i;
            //add schema inside task group for mapping UI values
            taskGroups[i].schema = JSON.parse(JSON.stringify(this._taskGroupSchemasMap[taskGroups[i].type ? taskGroups[i].type : 'parallel-taskgroup'])); //clone object (it is valid JSON so this technique is sufficient)
            (function(taskGroup) {
                _this._processProperties(taskGroup.schema.properties,function(type,propName,property) {
                    //move the task group properties to the value of each property in the schema
                    if (typeof taskGroup[property.title] !== 'undefined') {
                        property.value = taskGroup[property.title];
                        delete taskGroup[property.title]; //cleanup property since it's not used in UI
                    }
                });
            })(taskGroups[i]);
            //cleanup type since it's not used in UI
            delete taskGroups[i].type;

            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                //add schema inside task for mapping UI values
                tasks[j].schema = JSON.parse(JSON.stringify(this._taskSchemasMap[tasks[j].type])); //clone object (it is valid JSON so this technique is sufficient)
                (function(task) {
                    _this._processProperties(task.schema.properties,function(type,propName,property) {
                        //move the params values to the value of each property in the schema
                        if (task.params && typeof task.params[property.title] !== 'undefined') {
                            property.value = task.params[property.title];
                        }
                    });
                })(tasks[j]);
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
        e.dataTransfer.setData('action/group', e.model.item); //indicate that this item is a task group
        this._lastDragged = e.model.item;//reference task group schema so we can populate the UI on drop
        
        // Add a highlight effect showing all droppable areas for groups
        var acont = this.querySelectorAll('.actionContainer');
        Array.prototype.forEach.call(acont, function(el, i) {
            el.classList.add('highlight');
        });
    },

    /**
     * Task ondragstart event handler.
     * @param e
     * @private
     */
    _startDragTask: function(e) {
        e.dataTransfer.setData('action/task', e.model.item); //indicate that this item is a task
        this._lastDragged = e.model.item; //reference task schema so we can populate the UI on drop
        
        // Add a highlight effect showing all droppable areas for tasks
        var tgroups = this.querySelectorAll('.task-group');
        Array.prototype.forEach.call(tgroups, function(el, i) {
            el.classList.add('highlight');
        });
    },
    
    /**
     * Action ondragend common handler to remove all existing highlights
     * @param e
     * @private
     */
    _dragEndCommon: function(e) {
        var tgroups = this.querySelectorAll('.task-group');
        Array.prototype.forEach.call(tgroups, function(el, i) {
            el.classList.remove('highlight');
        });
        
        var acont = this.querySelectorAll('.actionContainer');
        Array.prototype.forEach.call(acont, function(el, i) {
            el.classList.remove('highlight');
        });
    },
    
    /**
     * Action ondragover event handler.
     * @param e
     * @private
     */
    _dragOverAction: function(e) {
        if ((e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/group')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/group') > -1)) {
            e.preventDefault(); //only allow task groups to be dragged into the container
        }
    },

    /**
     * Task group ondragover event handler.
     * @param e
     * @private
     */
    _dragOverGroup: function(e) {
        if ((e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/task')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/task') > -1)) {
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
        
        schema.taskcount = 0;
        
        var newid = "taskGroup"+this._taskGroups.length;
        this.push('_taskGroups',{"id":newid,"schema":schema,"tasks":[]});
        
        // We'll play a "grow" animation when an action is added
        var _this = this;
        setTimeout(function() {
            var justadded = _this.querySelector('#' + newid);
            if (justadded) {
                justadded.classList.add('growbubble');
            }
        },0);
        
        // Remove the grow animation after it's complete, so that the highlight keyframe still works properly
        setTimeout(function() {
            var justadded = _this.querySelector('#' + newid);
            if (justadded) {
                justadded.classList.remove('growbubble');
            }
        },550);
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
        
        // Try to get our task group index from the target ID
        // However there is a chance the user dropped the element on a component inside the container
        // In that case our target ID will be invalid
        // If that happens we will reverse traverse looking for "taskGroupX" ID to strip and use
        var taskGroupIndex = e.target.id.slice(-1);
        if (!taskGroupIndex) {
            var currentParent = e.target.parentNode;
            do {
                if (currentParent.id && currentParent.id.startsWith('taskGroup')) {
                    taskGroupIndex = currentParent.id.slice(-1);
                    break;
                }
                
                currentParent = currentParent.parentNode;
            } while(currentParent);
        }
        
        // Only add if we actually have a proper index figured out
        if (taskGroupIndex) {
            var taskIndex = this._taskGroups[taskGroupIndex].tasks.length;
            
            // Increase our task count and reflect the new number on the UI
            this._taskGroups[taskGroupIndex].schema.taskcount++;
            this.set('_taskGroups.'+taskGroupIndex+'.schema.taskcount', this._taskGroups[taskGroupIndex].schema.taskcount);
            
            // Update our task group list
            this.push('_taskGroups.'+taskGroupIndex+'.tasks',{"id":"task"+taskIndex,"schema":schema});
        }
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
                    // Reduce our task count for the action container parent
                    this._taskGroups[i].schema.taskcount--;
                    this.set('_taskGroups.'+i+'.schema.taskcount', this._taskGroups[i].schema.taskcount);
                    
                    // Then remove the entire task itself
                    this.splice('_taskGroups.'+i+'.tasks',j,1);
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
        var _this = this;
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
        setTimeout(function() {
            _this.set('_taskGroups.'+currPos+'.id','taskGroup'+currPos);
            _this.set('_taskGroups.'+newPos+'.id','taskGroup'+newPos);
        },0);

    },

    /**
     * Move a task group down.
     * @param e
     * @private
     */
    _moveTaskGroupDown: function(e) {
        var _this = this;
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
        setTimeout(function() {
            _this.set('_taskGroups.'+currPos+'.id','taskGroup'+currPos);
            _this.set('_taskGroups.'+newPos+'.id','taskGroup'+newPos);
        },0);
    },

    /**
     * Toggle the content of a task group / task.
     * @param e
     * @private
     */
    _toggleTask: function(e) {
        // Get our parent element to toggle
        // We also have to account for the arrow or smaller span text being clicked
        var parent = Polymer.dom(e.target).parentNode;
        if ((e.target.classList.contains('arrow')) ||
           (e.target.tagName === 'SPAN')) {
            parent = Polymer.dom(parent).parentNode;
        }
        
        parent.classList.toggle('toggled');
        parent.querySelector('.content').classList.toggle('toggled');
        parent.querySelector('.arrow').classList.toggle('toggled');
        parent.querySelector('.details').classList.toggle('toggled');
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
     * @param type
     * @returns {string}
     * @private
     */
    _addBooleanClass: function(type) {
        return type=='boolean' ? 'pointer' : '';
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

    /**
     * Template helper function.
     * @param title
     * @returns {boolean}
     * @private
     */
    _disableValidation: function(title) {
        //disable syntax checker for messageTemplate since the value can be a simple string
        return title.toLowerCase() === 'messagetemplate';
    },

    /**
     * Template helper function.
     * @param enumArray
     * @returns {boolean}
     * @private
     */
    _hasEnum: function(enumArray) {
        return enumArray && enumArray.length > 0;
    },

    //event handler functions

    _getHandlers: function() {
        var _this = this;
        bridgeit.io.eventhub.findHandlers({"realm":this.realm}).then(function(handlers) {
            var handlerMap = {};
            if (handlers) {
                handlers.forEach(function (handler) {
                    handlerMap[handler._id] = handler;
                });
            }
            _this._handlers = handlerMap;
        }).catch(function(error) {
            console.log('Error in getHandlers:',error);
            _this.fire('bridgeit-error', {error: error});
        });
    },

    _convertUIToHandler: function() {
        return {
            "active":!!this._handlerIsActive,
            "query":this._queryEditorRef.currentquery,
            "actionId":this._actionId,
            "actionParams":{}
        };
    },

    _loadHandler: function(id) {
        id = id + '_handler';
        var handler = this._handlers[id];
        this._handlerIsActive = !!(handler && handler.active ? handler.active : false);
        this._queryEditorRef.setEditorFromMongo({query:handler && handler.query ? handler.query : {}});
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