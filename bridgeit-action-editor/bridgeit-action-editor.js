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
            this.initialize();
        }
        this._loadedAction = null;
        this._taskGroups = [];
        this._codeEditorProperties=['function','messagetemplate','query','payload','userrecord','pushmessage'];
        this._taskGroupBaseId = 'taskGroup';
        this._taskBaseId = 'task';
        
        // Setup our sidebar to scroll alongside the action editor
        // This is necessary in case the action editor is quite long (such as many tasks)
        // Because we still want to see the draggable containers/tasks list
        this.offset = -1;
        this.lastScroll = -1;
        var _this = this;
        window.addEventListener("scroll", function() {
            var ourDiv = document.getElementById("fixedDiv");
            
            if (ourDiv) {
                // Set our component offset if we haven't already
                if (_this.offset < 0) {
                    _this.offset = ourDiv.offsetTop;
                }
                var compareTop = _this._calculateScrollbarPos(ourDiv.parentNode);
                
                // Skip out if our comparison is the same as our last scroll
                // This most likely happens when an unrelated scrollbar (rather than the main container) is used
                if (compareTop === _this.lastScroll) {
                    return;
                }
                _this.lastScroll = compareTop;
                
                // There is a chance we need to resize our left pane contents a bit
                // This would be necessary when the viewport is smaller than our left pane
                // If we don't do this the left pane will sticky to the top and make it so the user can never reach the bottom
                var h = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
                if (h) {
                    // Get all left pane contents
                    var panes = document.querySelectorAll(".leftPane");
                    
                    // Note we only want to bother looping our panes if we have the exact right amount
                    // This is a bit of a magic number, but refers to the container and item panes on the left
                    // So we know there are exactly 2 of them
                    if (panes.length === 2) {
                        for (var i = 0; i < panes.length; i++) {
                            // Calculate a height to 40% of the total page
                            // Between the two panels this leaves a padding buffer of 20%
                            var calcH = Math.round(h*0.4);
                            panes[i].style.height = null;
                            
                            // If we are below a bare minimum of 100px reset to 100 and force the height
                            if (calcH < 100) {
                                calcH = 100;
                                
                                panes[i].style.height = calcH + 'px';
                            }
                            
                            // Set the max height to our calculated value
                            panes[i].style.maxHeight = calcH + 'px';
                        }
                    }
                }
                
                // Use the unstickied version by default
                ourDiv.style.position = 'relative';
                ourDiv.style.top = null;
                
                // Only bother to sticky the container if our main content is big enough to need it
                // Similarly only sticky if our viewport is big enough that the user won't get stuck scrolling
                if ((document.getElementById("aeMain").clientHeight > ourDiv.clientHeight) &&
                    (h >= ourDiv.clientHeight)) {
                    // If the top of our scroll is beyond the sidebar offset it means
                    // the sidebar would no longer be visible
                    // At that point we switch to a fixed position with a top of 0
                    // We will reverse this process if the sidebar would naturally be visible again
                    // This is necessary beyond a standard "position: fixed" to ensure the sidebar doesn't
                    // stay fixed to the top of the page when it doesn't need to
                    // Note we include our "barpad" attribute, to ensure the shifting happens right away
                    if ((compareTop+_this.barpad) > _this.offset) {
                        ourDiv.style.position = 'fixed';
                        ourDiv.style.top = _this.barpad + 'px';
                    }
                }
            }
        }, true);
	},

    /**
     * If authentication is not provided on component load then this function can be used to initialize the component.
     */
    initialize: function() {
        this._loadQueryEditor();
        this.getTaskItems();
        this.getActions();
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
        return Promise.all(promises).then(function() {
            //since the editor div is included dynamically in the
            //template it's possible that it hasn't rendered yet
            var checkExist = setInterval(function() {
                if (_this.$$('#eventHandlerEditor')) {
                    _this.$$('#eventHandlerEditor').appendChild(_this._queryEditorRef);
                    clearInterval(checkExist);
                }
            },10);
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
        /* This approach fails for unknown reasons when loading multiple actions consecutively
           so reverting back to a plain loop that checks the value of each required field
        if (!this.$$('#actionForm').checkValidity()) {
            alert('Please enter all required fields.');
            return false;
        }*/
        var required = Polymer.dom(this.$$('#actionForm')).querySelectorAll('input:required');
        var groupIndex;
        for (var h=0; h<required.length; h++) {
            if (!required[h].value) {
                var label = required[h].getAttribute('data-label');
                var groupId = required[h].getAttribute('data-group-id');
                var taskId = required[h].getAttribute('data-task-id');
                var groupStr,taskStr;
                if (groupId) {
                    groupIndex = this._stripIndex(groupId);
                    groupStr = this._taskGroups[groupIndex].name || 'Task Group #'+(groupIndex+1).toString();
                }
                if (taskId) {
                    var taskIndex = this._stripIndex(taskId);
                    taskStr = this._taskGroups[groupIndex].tasks[taskIndex].name || 'Task #'+(taskIndex+1).toString();
                }
                var alertStr = 'You must define "' + label+'"';
                if (groupStr || taskStr) {
                    alertStr += '\n\n [' + (groupStr ? (groupStr) : '') + (taskStr ? (' > '+taskStr) : '') + ' > ' + label+']';
                }
                alert(alertStr);
                required[h].focus();
                return false;
            }
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
                        if (propertyVal[l] && propertyVal[l].toString().trim().length > 0) {
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
        var _this = this;
        var action = {"_id": this._actionId};
        if (this._actionDesc && this._actionDesc.trim().length > 0) {
            action.desc = this._actionDesc;
        }
        var taskGroups = JSON.parse(JSON.stringify(this._taskGroups)); //clone array (it is valid JSON so this technique is sufficient)
        for (var i=0; i<taskGroups.length; i++) {
            taskGroups[i].type = taskGroups[i].schema.title; //move title to type property
            processTaskGroups(taskGroups[i]);
            //cleanup values that aren't used in the action
            delete taskGroups[i].id;
            delete taskGroups[i].schema;

            var tasks = taskGroups[i].tasks;
            for (var j=tasks.length-1; j>=0; j--) {
                tasks[j].params = {}; //create action params object
                tasks[j].type = tasks[j].schema.title; //move title to type property
                processTasks(tasks[j]);
                if (!tasks[j].schema.isElseTask) {
                    //cleanup values that aren't used in the action
                    delete tasks[j].id;
                    delete tasks[j].schema;
                }
                else {
                    //we have a conditional task group and an else task so move the task item to the elseTasks list
                    if (!taskGroups[i].elseTasks) {
                        taskGroups[i].elseTasks = [];
                    }
                    //add task to elseTasks
                    taskGroups[i].elseTasks.push(tasks[j]);
                    //remove task from tasks
                    taskGroups[i].tasks.splice(j,1);
                    //cleanup values that aren't used in the action
                    delete taskGroups[i].elseTasks[taskGroups[i].elseTasks.length-1].id;
                    delete taskGroups[i].elseTasks[taskGroups[i].elseTasks.length-1].schema;
                }
            }
            //since we looped backwards (to accommodate the splice) the elseTasks will be in the reverse order
            if (taskGroups[i].elseTasks) {
                taskGroups[i].elseTasks.reverse();
            }
        }
        action.taskGroups = taskGroups;
        return action;

        function processTaskGroups(taskGroup) {
            _this._processProperties(taskGroup.schema.properties,function(type,propName,property) {
                //move the values of each property in the schema directly into the task group
                if (typeof property.value !== 'undefined' && property.value.toString().trim().length > 0) {
                    taskGroup[property.title] = property.value;
                }
            });
        }
        function processTasks(task) {
            _this._processProperties(task.schema.properties,function(type,propName,property) {
                //move the values of each property in the schema to the params object
                if (typeof property.value !== 'undefined' && property.value.toString().trim().length > 0) {
                    task.params[property.title] = property.value;
                }
            });
        }
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
                if (currentSchema.label.indexOf(serviceArray[s].label) === 0) {
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
        this._queryEditorRef = new BridgeIt.QueryEditor(this.account,this.realm,'metrics','events',null,{"limit":100,"sort":{"time":-1}},null);
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
            taskGroups[i].id = this._taskGroupBaseId+i;
            //add schema inside task group for mapping UI values
            taskGroups[i].schema = JSON.parse(JSON.stringify(this._taskGroupSchemasMap[taskGroups[i].type ? taskGroups[i].type : 'parallel-taskgroup'])); //clone object (it is valid JSON so this technique is sufficient)
            taskGroups[i].schema.taskcount = 0;
            processTaskGroups(taskGroups[i]);
            //cleanup type since it's not used in UI
            delete taskGroups[i].type;
            //process tasks
            var tasks = taskGroups[i].tasks;
            for (var j=0; j<tasks.length; j++) {
                //add uniqueID for drag/drop functionality
                tasks[j].id = _this._taskBaseId+j;
                convertTasks(tasks[j],false);
            }
            //process elseTasks (for conditional task groups)
            var elseTasks = taskGroups[i].elseTasks;
            if (elseTasks) {
                for (var k=0; k<elseTasks.length; k++) {
                    //add uniqueID for drag/drop functionality
                    //id is based on entire group not just the elseTasks section
                    //so we account for the number of "if" tasks as well
                    elseTasks[k].id = _this._taskBaseId+(tasks.length+k);
                    convertTasks(elseTasks[k],true);
                }
                //combine the two arrays into one for the template
                taskGroups[i].tasks = tasks.concat(elseTasks);
                delete taskGroups[i].elseTasks;
            }
        }
        return taskGroups;

        function convertTasks(task,isElseTask) {
            //add schema inside task for mapping UI values
            task.schema = JSON.parse(JSON.stringify(_this._taskSchemasMap[task.type])); //clone object (it is valid JSON so this technique is sufficient)
            task.schema.isElseTask = isElseTask;
            taskGroups[i].schema.taskcount++;
            processTasks(task);
        }

        function processTaskGroups(taskGroup) {
            _this._processProperties(taskGroup.schema.properties,function(type,propName,property) {
                //move the task group properties to the value of each property in the schema
                if (typeof taskGroup[property.title] !== 'undefined') {
                    property.value = taskGroup[property.title];
                    delete taskGroup[property.title]; //cleanup property since it's not used in UI
                }
            });
        }
        function processTasks(task) {
            _this._processProperties(task.schema.properties,function(type,propName,property) {
                //move the params values to the value of each property in the schema
                if (task.params && typeof task.params[property.title] !== 'undefined') {
                    property.value = task.params[property.title];
                }
            });
        }
    },
    
    /**
     * Task group ondragstart event handler.
     * @param e
     * @private
     */
    _startDragGroup: function(e) {
        if (e.model.item) {
            e.dataTransfer.setData('action/group/new', e.model.item); //indicate that this item is a new task group
            this._lastDragged = e.model.item; //reference task group schema so we can populate the UI on drop
        }
        else {
            e.dataTransfer.setData('action/group/existing', e.model.group); //indicate that this item is an existing task group (already in the action)
            this._lastDragged = e.model.group; //reference task group so we can populate the UI on drop
        }

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
        //prevent bubbling, without this the _startDragGroup listener will be called as well
        e.stopPropagation();

        if (e.model.item) {
            e.dataTransfer.setData('action/task/new', e.model.item); //indicate that this item is a new task
            this._lastDragged = e.model.item; //reference task schema so we can populate the UI on drop
        }
        else {
            e.dataTransfer.setData('action/task/existing', e.model.task); //indicate that this item is an existing task (already in a group)
            this._lastDragged = {'task':e.model.task,'groupIndex':this._stripIndex(e.target.getAttribute('data-group-id'))}; //reference task and the group it is from
        }

        // Add a highlight effect showing all droppable areas for tasks
        var tgroups = this.querySelectorAll('.task-group');
        Array.prototype.forEach.call(tgroups, function(el, i) {
            if (el.getAttribute('data-title') === 'conditional-taskgroup') {
                //for a conditional task group only the if/else sections are highlighted
                el.querySelector('.if').classList.add('highlight');
                el.querySelector('.else').classList.add('highlight');
            }
            else {
                el.classList.add('highlight');
            }
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
            if (el.getAttribute('data-title') === 'conditional-taskgroup') {
                //for a conditional task group only the if/else sections are highlighted
                el.querySelector('.if').classList.remove('highlight');
                el.querySelector('.else').classList.remove('highlight');
            }
            else {
                el.classList.remove('highlight');
            }
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
        if ((e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/group/new')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/group/new') > -1) ||
            (e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/group/existing')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/group/existing') > -1)) {
            e.preventDefault(); //only allow task groups to be dragged into the container
        }
    },

    /**
     * Task group ondragover event handler.
     * @param e
     * @private
     */
    _dragOverGroup: function(e) {
        if ((e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/task/new')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/task/new') > -1) ||
            (e.dataTransfer.types.contains && e.dataTransfer.types.contains('action/task/existing')) ||
            (e.dataTransfer.types.indexOf && e.dataTransfer.types.indexOf('action/task/existing') > -1)) {
            e.preventDefault(); //only allow tasks to be dragged into the task groups
        }
    },

    /**
     * Action ondrop event handler.
     * @param e
     * @private
     */
    _dropInAction: function(e) {
        // Requirement for drag and drop
        e.preventDefault();

        var _this = this;
        var data;
        var currPos;
        // Only allow task groups to be dropped inside actions
        if (e.dataTransfer.getData('action/group/new')) {
            data = JSON.parse(JSON.stringify(this._lastDragged)); //clone schema obj
            data.taskcount = 0; //set default taskcount
        }
        else if (e.dataTransfer.getData('action/group/existing')) {
            data = this._lastDragged; //reference existing group
            currPos = this._taskGroups.indexOf(this._lastDragged);
        }
        else {
            e.stopPropagation();
            return;
        }
        
        // If we have existing action containers (aka task groups) we need to check if the
        //  user tried to drop between them
        // In that case we'll want to insert the dropped task group instead of appending it to the bottom
        var appendBottom = true;
        var newid;
        if (this._taskGroups.length > 0) {
            // First we determine the absolute Y position we dropped at
            // This is a combination of the scrollbar position (via scrollTop) and our event clientY
            //  which shows where in the viewport the mouse was at drop
            // We can add these two together to get an absolute Y of the page
            // Note we also have to get a bit fancy to reliably determine scrollTop
            //  since our component might be in a scrollable container, instead of just a body scrollbar
            var compareTop = this._calculateScrollbarPos(e.target.parentNode);
            //absolute Y position of the drop
            var dropY = e.clientY + compareTop;

            // Next we look at our current task groups
            // For each task group we'll figure out the offsetTop
            // If our dropY is greater than that offsetTop we know we're still below that task group
            // However if our dropY is less we know we're above that task group
            // Using this approach we can figure out where to insert our dropped item
            // We store the task group index we should insert at in the "insertIndex" var
            // If "insertIndex" is undefined (such as when we're dropped above all tasks) then we will append
            var insertIndex;
            var currentTaskGroup;
            for (var i = 0; i < this._taskGroups.length; i++) {
                currentTaskGroup = this.querySelector('#' + this._taskGroups[i].id);
                if (currentTaskGroup) {
                    if (dropY > currentTaskGroup.offsetTop) {
                        insertIndex = this._stripIndex(currentTaskGroup.id);
                        insertIndex++; // Note we increase our insertIndex since we want to be BELOW the current item
                    }
                    else {
                        // There is a chance here we're either at the end of our task group list
                        // Or the dropY was so low because it was inserted ABOVE the task group list
                        // So if we're in this case and still on the first loop we know we're above
                        // Note we use a 30 buffer to match the margins of the acceptable drop area above the task group list
                        if (i === 0 && dropY > (currentTaskGroup.offsetTop - 30)) {
                            insertIndex = 0;
                        }
                        break;
                    }
                }
            }
            if (insertIndex > currPos) {
                insertIndex -= 1;
            }

            // If we have an "insertIndex" it means we figured out where the task group should be inserted
            if (typeof insertIndex !== 'undefined' && insertIndex < this._taskGroups.length) {
                appendBottom = false;
                newid = this._taskGroupBaseId + insertIndex.toString();
                if (e.dataTransfer.getData('action/group/new')) {
                    this.splice('_taskGroups', insertIndex, 0, {"id":newid,"name":'',"schema":data,"tasks":[]});
                }
                else {
                    //if the position hasn't changed do nothing
                    if (currPos === insertIndex) {
                        return;
                    }
                    //move from current position to new position
                    this.splice('_taskGroups',currPos,1);
                    this.splice('_taskGroups',insertIndex,0,data);
                }
            }
            // Otherwise if we don't have an "insertIndex" it means we just append to the bottom
            else {
                appendBottom = true;
            }
        }
        // If we reached here and still have "appendBottom" set to true we will add our dropped item to the bottom
        //  of the task group array via push
        if (appendBottom) {
            newid = this._taskGroupBaseId + (this._taskGroups.length).toString();
            if (e.dataTransfer.getData('action/group/new')) {
                this.push('_taskGroups', {"id": newid, "name": '', "schema": data, "tasks": []});
            }
            else {
                //remove from current position and push to end of action
                this.splice('_taskGroups',currPos,1);
                this.push('_taskGroups',data);
            }
        }

        setTimeout(function() {
            //keep the task group ids up to date for drag/drop functionality
            _this._updateTaskGroupIds();

            // Finally if we have a valid new ID we'll get that task group
            // item and play a "grow" animation to draw attention to it
            if (newid) {
                _this._doGrowAnimation('#'+newid);
            }
        },0);
    },

    /**
     * Task group ondrop event handler.
     * @param e
     * @private
     */
    _dropInGroup: function(e) {
        // Requirement for drag and drop
        e.preventDefault();

        var _this = this;
        //only allow tasks to be dropped inside task groups
        var data;
        var currPos;
        var previousGroupIndex;
        if (e.dataTransfer.getData('action/task/new')) {
            data = JSON.parse(JSON.stringify(this._lastDragged)); //clone schema obj
            //determine if the task was dropped in the conditional task group else area
            data.isElseTask = !!(e.target.className.indexOf('conditional-task-group') > -1 && e.target.className.indexOf('else') > -1);
        }
        else if (e.dataTransfer.getData('action/task/existing')) {
            data = this._lastDragged.task; //reference existing task
            //determine if the task was dropped in the conditional task group else area
            data.schema.isElseTask = !!(e.target.className.indexOf('conditional-task-group') > -1 && e.target.className.indexOf('else') > -1);
            previousGroupIndex = this._lastDragged.groupIndex;
            //get the current position of the task in its origin group
            currPos = this._taskGroups[previousGroupIndex].tasks.indexOf(data);
        }
        else {
            e.stopPropagation();
            return;
        }

        // Try to get our task group index from the target ID
        // However there is a chance the user dropped the element on a component inside the container
        // or that the user dropped into a conditional task group drop area
        // In these cases our target ID will be invalid
        // If that happens we will reverse traverse looking for "taskGroupX" ID to strip and use
        var taskGroupIndex = e.target.id.indexOf(this._taskGroupBaseId) === 0 ? this._stripIndex(e.target.id) : null;
        if (typeof taskGroupIndex !== 'number') {
            var currentParent = e.target.parentNode;
            do {
                if (currentParent.id && currentParent.id.indexOf(this._taskGroupBaseId) === 0) {
                    taskGroupIndex = this._stripIndex(currentParent.id);
                    break;
                }
                currentParent = currentParent.parentNode;
            } while(currentParent);
        }
        
        //Only add if we actually have a proper index figured out +
        //For conditional task groups, don't allow dropping outside of if/else areas
        if (typeof taskGroupIndex !== 'number') { /*||
            (this._taskGroups[taskGroupIndex].schema.title === 'conditional-taskgroup' &&
            e.target.className.indexOf('conditional-task-group') === -1)) {*/
            return;
        }

        var tasks = this._taskGroups[taskGroupIndex].tasks;
        var appendBottom = true;
        var newid;
        if (tasks.length > 0) {
            //calculate absolute Y position of the drop
            var scrollbarPos = this._calculateScrollbarPos(e.target.parentNode);
            var dropY = e.clientY + scrollbarPos;

            //determine where the Y position is in relative to the other tasks
            var insertIndex;
            var currentTask;
            for (var i = 0; i < tasks.length; i++) {
                currentTask = this.querySelector('#' + this._taskGroupBaseId + taskGroupIndex + ' [data-id="' + tasks[i].id + '"]');
                if (currentTask) {
                    var currentTaskPos = currentTask.getBoundingClientRect().top + scrollbarPos;
                    if (dropY > currentTaskPos) {
                        insertIndex = this._stripIndex(currentTask.getAttribute('data-id'));
                        insertIndex++;
                    }
                    else {
                        if (i === 0) {
                            insertIndex = 0;
                        }
                        break;
                    }
                }
            }
            if ((previousGroupIndex === taskGroupIndex) && (insertIndex > currPos)) {
                insertIndex -= 1;
            }

            //if we have an "insertIndex" it means we figured out where the task group should be inserted
            if (typeof insertIndex !== 'undefined' && insertIndex < tasks.length) {
                appendBottom = false;
                newid = this._taskBaseId + insertIndex.toString();
                if (e.dataTransfer.getData('action/task/new')) {
                    this.splice('_taskGroups.' + taskGroupIndex + '.tasks', insertIndex, 0,  {"id": newid,"schema": data});
                }
                else {
                    //if the position hasn't changed do nothing
                    if ((previousGroupIndex === taskGroupIndex) &&
                        (currPos === insertIndex)) {
                        return;
                    }
                    //move from current position to new position
                    this.splice('_taskGroups.'+previousGroupIndex+'.tasks',currPos,1);
                    this.splice('_taskGroups.'+taskGroupIndex+'.tasks',insertIndex,0,data);
                }

            }
            else {
                appendBottom = true;
            }
        }

        if (appendBottom) {
            if (e.dataTransfer.getData('action/task/new')) {
                newid = this._taskBaseId + tasks.length.toString();
                this.push('_taskGroups.'+taskGroupIndex+'.tasks', {"id":newid,"schema":data});
            }
            else {
                newid = this._taskBaseId + (this._taskGroups[taskGroupIndex].tasks.length).toString();
                //remove from current position and push to end of task
                this.splice('_taskGroups.'+previousGroupIndex+'.tasks',currPos,1);
                this.push('_taskGroups.'+taskGroupIndex+'.tasks', data);
            }
        }

        setTimeout(function() {
            //keep the task ids up to date for drag/drop functionality
            _this._updateTaskIds();
            //play a "grow" animation to draw attention to the new task
            if (newid) {
                _this._doGrowAnimation('#'+_this._taskGroupBaseId+taskGroupIndex + ' [data-id="' + newid + '"]');
            }
            //set the task count for the group(s)
            if (typeof previousGroupIndex === 'number') {
                _this.set('_taskGroups.'+previousGroupIndex+'.schema.taskcount', _this._taskGroups[previousGroupIndex].tasks.length);
            }
            _this.set('_taskGroups.'+taskGroupIndex+'.schema.taskcount', _this._taskGroups[taskGroupIndex].tasks.length);
        },0);
    },

    /**
     * Get the index based on a task group id.
     * @param id
     * @returns {number}
     * @private
     */
    _stripIndex: function(id) {
        //strip the numbers from the end of the string
        var index = id.replace(/^\D+/g, '');
        index = parseInt(index);
        return index;
    },

    /**
     * Return the current vertical position of the scroll bar.
     * @param parent
     * @returns {number}
     * @private
     */
    _calculateScrollbarPos: function(parent) {
        // Normally we can just use the document "scrollTop" (via a few browser compatible ways)
        // But there is a chance our component will be used inside a scrollable container
        // In that case we need to get the scrollTop of any valid parent container
        // So basically if we can't get the scrollTop a normal way, we reverse traverse the
        // parent nodes until we find a valid scrollTop, or hit the top of the document (when parentNode = null)
        var position = (document.documentElement.scrollTop || document.body.scrollTop);
        if (position <= 0) {
            var currentNode = parent;
            while (currentNode !== null) {
                if (currentNode.scrollTop > 0) {
                    position = currentNode.scrollTop;
                    break;
                }
                currentNode = currentNode.parentNode;
            }
        }
        return position;
    },

    /**
     * Generates a grow animation when dropping task groups and tasks.
     * @param selector
     * @private
     */
    _doGrowAnimation: function(selector) {
        var _this = this;
        setTimeout(function() {
            var justadded = _this.querySelector(selector);
            if (justadded) {
                justadded.classList.add('growbubble');
            }
        },0);

        // Remove the grow animation after it's complete, so that the highlight keyframe still works properly
        setTimeout(function() {
            var justadded = _this.querySelector(selector);
            if (justadded) {
                justadded.classList.remove('growbubble');
            }
        },550);
    },
    
    /**
     * Delete a task group.
     * @param e
     * @private
     */
    _deleteTaskGroup: function(e) {
        var groupIndex = this._stripIndex(e.model.group.id);
        this.splice('_taskGroups',groupIndex,1);
        //keep the task group ids up to date for drag/drop functionality
        this._updateTaskGroupIds();
    },

    /**
     * Delete a task.
     * @param e
     * @private
     */
    _deleteTask: function(e) {
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var taskIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));

        // Reduce our task count for the action container parent
        this._taskGroups[groupIndex].schema.taskcount--;
        this.set('_taskGroups.'+groupIndex+'.schema.taskcount', this._taskGroups[groupIndex].schema.taskcount);

        // Then remove the entire task itself
        this.splice('_taskGroups.'+groupIndex+'.tasks',taskIndex,1);

        //keep the task ids up to date for drag/drop functionality
        this._updateTaskIds();
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
            _this.set('_taskGroups.'+currPos+'.id',_this._taskGroupBaseId+currPos);
            _this.set('_taskGroups.'+newPos+'.id',_this._taskGroupBaseId+newPos);
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
            _this.set('_taskGroups.'+currPos+'.id',_this._taskGroupBaseId+currPos);
            _this.set('_taskGroups.'+newPos+'.id',_this._taskGroupBaseId+newPos);
        },0);
    },

    /**
     * Clone a task group.
     * @param e
     * @private
     */
    _cloneTaskGroup: function(e) {
        var taskGroup = e.model.group;
        var groupIndex = parseInt(this._stripIndex(taskGroup.id));
        var newIndex = groupIndex+1;

        var clonedTaskGroup = JSON.parse(JSON.stringify(taskGroup));
        clonedTaskGroup.name = clonedTaskGroup.name+'_clone';

        //by default add the cloned task group after the one that was cloned
        this.splice('_taskGroups',newIndex,0,clonedTaskGroup);

        this._updateTaskGroupIds();
        this._doGrowAnimation('#'+this._taskGroupBaseId+newIndex);
    },

    /**
     * Move a task up.
     * @param e
     * @private
     */
    _moveTaskUp: function(e) {
        var _this = this;
        var task = e.model.task;
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var currPos = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));
        var newPos = currPos-1;
        if (newPos < 0) {
            //it's possible the that we have a conditional task group and there are no tasks
            //inside the "if" section, if that's the case then we can "move" this one up
            if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
                this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',false);
            }
            return;
        }

        //special handling for conditional task groups so we can move task items between the if / else sections
        if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
            !this._taskGroups[groupIndex].tasks[newPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',false);
        }

        //move the task up
        this.splice('_taskGroups.'+groupIndex+'.tasks',currPos,1);
        this.splice('_taskGroups.'+groupIndex+'.tasks',newPos,0,task);

        //keep the task ids in sync
        setTimeout(function() {
            _this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.id',_this._taskBaseId+currPos);
            _this.set('_taskGroups.'+groupIndex+'.tasks.'+newPos+'.id',_this._taskBaseId+newPos);
        },0);
    },

    /**
     * Move a task down.
     * @param e
     * @private
     */
    _moveTaskDown: function(e) {
        var _this = this;
        var task = e.model.task;
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var currPos = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));
        var newPos = currPos+1;
        if (newPos == this._taskGroups[groupIndex].tasks.length) {
            //it's possible the that we have a conditional task group and there are no tasks
            //inside the "else" section, if that's the case then we can "move" this one down
            if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
                !this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',true);
            }
            return;
        }

        //special handling for conditional task groups so we can move task items between the if / else sections
        if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup') {
            if (this._taskGroups[groupIndex].tasks[newPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',true);
            }
        }

        //move the task down
        this.splice('_taskGroups.'+groupIndex+'.tasks',currPos,1);
        this.splice('_taskGroups.'+groupIndex+'.tasks',newPos,0,task);

        //keep the task ids in sync
        setTimeout(function() {
            _this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.id',_this._taskBaseId+currPos);
            _this.set('_taskGroups.'+groupIndex+'.tasks.'+newPos+'.id',_this._taskBaseId+newPos);
        },0);
    },

    /**
     * Clone a task.
     * @param e
     * @private
     */
    _cloneTask: function(e) {
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var taskIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));
        var newIndex = taskIndex+1;

        var clonedTask = JSON.parse(JSON.stringify(e.model.task));
        clonedTask.name = clonedTask.name+'_clone';

        //by default add the cloned task after the one that was cloned
        this.splice('_taskGroups.'+groupIndex+'.tasks',newIndex,0,clonedTask);

        this._updateTaskIds();
        this._doGrowAnimation('#'+this._taskGroupBaseId+groupIndex + ' [data-id="' + this._taskBaseId+newIndex.toString() + '"]');
        this.set('_taskGroups.'+groupIndex+'.schema.taskcount', this._taskGroups[groupIndex].tasks.length);
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
        if (parent.querySelector('.details')) {
            parent.querySelector('.details').classList.toggle('toggled');
        }
    },

    /**
     * Keeps the task group ids in sync.
     * @private
     */
    _updateTaskGroupIds: function() {
        for (var i = 0; i < this._taskGroups.length; i++) {
            this.set('_taskGroups.' + i + '.id', this._taskGroupBaseId+i);
        }
    },

    /**
     * Keeps the task ids in sync.
     * @private
     */
    _updateTaskIds: function() {
        for (var i=0; i<this._taskGroups.length; i++) {
            for (var j=0; j<this._taskGroups[i].tasks.length; j++) {
                this.set('_taskGroups.'+i+'.tasks.'+j+'.id',this._taskBaseId+j);
            }
        }
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
     * Template helper function.
     * @param title
     * @private
     */
    _isConditionalTaskGroup: function(title) {
        return title === 'conditional-taskgroup';
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
     * @return {boolean}
     * @private
     */
    _isTransportEditor: function(title) {
        return title.toLowerCase() === 'messagetemplate';
    },
    
    /**
     * Template helper function
     * Format the passed name with brackets and spacing as necessary
     * This is meant to be used in the collapsed title of a task group
     * @param name
     * @returns {string}
     * @private
     */
    _formatTaskName: function(name) {
        if (typeof name !== 'undefined' && name) {
            return ' (' + name + ')';
        }
    },
    
    /**
     * Template helper function
     * Format the passed name and task count with brackets and spacing as necessary
     * Desired return format is (Name, X tasks)
     * This is meant to be used in the title of an action container element
     * @param name
     * @param taskcount
     * @return {string}
     * @private
     */
    _formatContainerName: function(name, taskcount) {
        var toReturn = ' (';
        
        if (typeof taskcount === 'undefined' || !taskcount) {
            taskcount = 0;
        }
        
        if (typeof name !== 'undefined' && name) {
            toReturn += name + ', ';
        }
        
        toReturn += taskcount + ' task';
        // Pluralize if necessary
        if (taskcount !== 1) {
            toReturn += 's';
        }
        
        toReturn += ')';
        return toReturn;
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