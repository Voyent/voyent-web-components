Polymer({
    is: "action-task",
    behaviors: [Voyent.ActionBehavior],

    properties: {
        /**
         * The group that the task belongs to.
         */
        group: { type: Object },
        /**
         * The task data that will be rendered.
         */
        task: { type: Object },
        /**
         * The list of task groups and tasks, two-way bound with main action-editor component.
         */
        _taskGroups: { type: Array, notify: true },
        /**
         * The last dragged item, two-way bound with main action-editor component.
         */
        _lastDragged: { type: Object, notify: true },
        /**
         * The last dragged item type, two-way bound with main action-editor component.
         */
        _lastDraggedType: { type: String, notify: true }
    },

    ready: function() {
        this._codeEditorProperties=['function','messagetemplate','transporttemplate','query','payload','userrecord','pushmessage','data'];
    },

    /**
     * Move a task up.
     * @param e
     * @private
     */
    _moveTaskUp: function(e) {
        var _this = this;
        var task = this.task;
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var currPos = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));
        var newPos = currPos-1;
        if (newPos < 0) {
            //it's possible the that we have a conditional task group and there
            //are no tasks inside the "if" section, if that's the case then we
            //can "move" this one up by changing the isElseTask flag
            if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
                this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',false);
            }
            return;
        }

        //special handling for conditional task groups for moving tasks between the if / else sections
        if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
            this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask &&
            !this._taskGroups[groupIndex].tasks[newPos].schema.isElseTask) {
            this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',false);
            //don't splice since we just "moved" between a conditional if/else group
            return;
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
        var task = this.task;
        var taskElem = Polymer.dom(e.target.parentNode).parentNode;
        var groupIndex = parseInt(this._stripIndex(taskElem.getAttribute('data-group-id')));
        var currPos = parseInt(this._stripIndex(taskElem.getAttribute('data-id')));
        var newPos = currPos+1;
        if (newPos == this._taskGroups[groupIndex].tasks.length) {
            //it's possible the that we have a conditional task group and there
            //are no tasks inside the "else" section, if that's the case then we
            //can "move" this one down by changing the isElseTask flag
            if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
                !this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask) {
                this.set('_taskGroups.'+groupIndex+'.tasks.'+currPos+'.schema.isElseTask',true);
            }
            return;
        }

        //special handling for conditional task groups for moving tasks between the if / else sections
        if (this._taskGroups[groupIndex].schema.title === 'conditional-taskgroup' &&
            !this._taskGroups[groupIndex].tasks[currPos].schema.isElseTask &&
            this._taskGroups[groupIndex].tasks[newPos].schema.isElseTask) {
            this.set('_taskGroups.' + groupIndex + '.tasks.' + currPos + '.schema.isElseTask', true);
            //don't splice since we just "moved" between a conditional if/else group
            return;
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

        var clonedTask = JSON.parse(JSON.stringify(this.task));
        clonedTask.name = clonedTask.name+'_clone';

        //by default add the cloned task after the one that was cloned
        this.splice('_taskGroups.'+groupIndex+'.tasks',newIndex,0,clonedTask);

        this._updateTaskIds();
        this._doGrowAnimation('#'+this._taskGroupBaseId+groupIndex + ' [data-id="' + this._taskBaseId+newIndex.toString() + '"]');
        this.set('_taskGroups.'+groupIndex+'.schema.taskcount', this._taskGroups[groupIndex].tasks.length);
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
     * @param title
     * @return {boolean}
     * @private
     */
    _isTransportEditor: function(title) {
        return title.toLowerCase() === 'transporttemplate';
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
     * Format the passed name with brackets and spacing as necessary
     * This is meant to be used in the collapsed title of a task group.
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
     * Template helper function.
     * @param index
     * @private
     */
    _toOneBasedIndex: function(index) {
        return index+1;
    }
});