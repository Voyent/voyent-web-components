var ElementType = {
    INPUTANY: "inputAny",
    INPUTLETTERS: "inputLetters",
    INPUTNUM: "inputNum",
    CHECKBOX: "checkbox",
    TEXT: "text"
};

Polymer({
	is: "voyent-form-builder",

    properties: {
        toAdd: { type: Object, notify: true },
        editIndex: { type: String },
        value: { type: Object, reflectToAttribute: true, notify: true },
        /**
         * Disable the Enter key automatically submitting the form element dialog
         */
        disableenterkey: { type: Boolean, value: false },
    },
    
    /**
     * Define our initial tool data structure for backing our UI controls
     */
	ready: function() {
	    // On resize move our dialog arrow as needed
	    var _this = this;
	    window.addEventListener('resize', function() {
            _this._attachAddDialogArrow();
	    });
	    
	    this.addClear();
	    this.value = { "form": [] };
	},
	
	updateIndexes: function() {
	    if (this.value && this.value.form && this.value.form.length > 0) {
	        for (var i = 0; i < this.value.form.length; i++) {
	            this.set('value.form.' + i + '.index', "index" + i);
	        }
	        
	        // Force update the page level loop
	        // This ensures the underlying item in data-item is updated
	        this.notifyPath('value');
	        this.notifyPath('value.form');
	        this.querySelector('#formElements').render();
	    }
	},
	
    onEnterKey: function() {
        if (!this.disableenterkey) {
            // Only bother if our dialog exists and is actually shown
            var addDialog = this.querySelector('#addDialog');
            if (addDialog && addDialog.style.display !== 'none') {
                // Grab our button and sim click it
                var confirmButton = this.querySelector('#confirmButton');
                if (confirmButton) {
                    confirmButton.click();
                }
            }
        }
    },
	
	clickAddElement: function() {
	    this.addReset();
	    
	    this._openAddDialog();
	},
	
	clickEditElement: function(e) {
        if (e && e.target && e.target.dataset) {
            var item = e.target.dataset.item;
            
            if (item) {
                this.set('toAdd', JSON.parse(item));
                this.set('editIndex', this.toAdd.index);
                
                this._openAddDialog();
            }
        }
	},
	
	clickDeleteElement: function(e) {
        if (e && e.target && e.target.dataset) {
            var item = e.target.dataset.item;
            
            if (item) {
                this._deleteGeneric(JSON.parse(item));
            }
        }
	},
	
	_deleteGeneric: function(item) {
        for (var i = 0; i < this.value.form.length; i++) {
            if (item.index === this.value.form[i].index) {
                this.splice('value.form', i, 1);
                this.updateIndexes();
                break;
            }
        }
	},
	
	clickMoveUp: function(e) {
	    this._moveGeneric(e, -1);
	},
	
	clickMoveDown: function(e) {
	    this._moveGeneric(e, 1);
	},
	
	_moveGeneric: function(e, indexChange) {
        // Only bother dropping to reorder if we actually have multiple elements
        if (this.value.form.length < 2) {
            this._clearDropAreas();
            return;
        }
	    
        if (e && e.target && e.target.dataset) {
            var item = e.target.dataset.item;
            
            if (item) {
                item = JSON.parse(item);
                
                // Check our item index
                // Determine if we are trying an invalid move, like up when already at the top
                var itemIndex = new Number(item.index.substring('index'.length));
                var desiredIndex = (itemIndex + indexChange);
                if (desiredIndex >= 0 && desiredIndex < this.value.form.length) {
                    this.splice('value.form', itemIndex, 1);
                    this.splice('value.form', desiredIndex, 0, item);
                    this.updateIndexes();
                }
            }
        }
	},
	
	clickAddCancel: function() {
	    // Reset our form and close the dialog
	    this.addClear();
	    this._closeAddDialog();
	},
	
	clickAddConfirm: function() {
	    // Determine if we're editing or creating new
	    if (this.editIndex) {
            // Get the item that matches what we're editing, and change it in the list
            for (var i = 0; i < this.value.form.length; i++) {
                if (this.editIndex == this.value.form[i].index) {
                    this.set('value.form.' + i, JSON.parse(JSON.stringify(this.toAdd)));
                    break;
                }
            }
	    }
	    else {
            // TODO Validate before adding the new element
            // Add a clone to our form details
            this.push('value.form', JSON.parse(JSON.stringify(this.toAdd)));
            this.updateIndexes();
        }
        
        this.addClear();
        this._closeAddDialog();
	},
	
	addClear: function() {
	    this.addReset();
	    this.set('toAdd.type', null);
	},
	
	addReset: function() {
	    this.set('toAdd', {
            index: null,
	        title: null,
            type: ElementType.INPUTANY,
            description: null,
            minlength: null,
            maxlength: null,
            required: false
	    });
	    this.set('editIndex', null);
	},
	
    dropToDelete: function(e) {
        if (e && e.dataTransfer) {
            var item = e.dataTransfer.getData("item");
            
            if (item) {
                this._deleteGeneric(JSON.parse(item));
            }
        }
        
        this._clearDropAreas();
    },
    
    dropToReorder: function(e) {
        // Only bother dropping to reorder if we actually have multiple elements
        if (this.value.form.length < 2) {
            this._clearDropAreas();
            return;
        }
        
        if (e && e.dataTransfer) {
            var item = e.dataTransfer.getData("item");
            
            if (item) {
                // JSONify
                item = JSON.parse(item);
                
                // Figure out the absolute Y position of where we dropped, including scrollbars
                var compareTop = this._calculateScrollbarPos(e.target.parentNode);
                var dropY = e.clientY + compareTop;
                
                // Loop through our other elements, check their Y position, and determine where we should move
                var insertIndex;
                var currentElement;
                for (var i = 0; i < this.value.form.length; i++) {
                    currentElement = this.querySelector('#elementindex' + i);
                    if (currentElement) {
                        var currentElementPos = currentElement.getBoundingClientRect().top + compareTop;
                        if (dropY > currentElementPos) {
                            insertIndex = currentElement.id.substring('elementindex'.length);
                        }
                        else {
                            if (i === 0) {
                                insertIndex = 0;
                            }
                            break;
                        }
                    }
                }
                
                // If we have an insertIndex then move the element
                if (typeof insertIndex !== 'undefined' && insertIndex < this.value.form.length) {
                    // Check if our actual position has changed
                    var ourIndex = item.index.substring('index'.length);
                    if (insertIndex != ourIndex) {
                        this.splice('value.form', ourIndex, 1);
                        this.splice('value.form', insertIndex, 0, item);
                        this.updateIndexes();
                    }
                }
            }
        }
        
        this._clearDropAreas();
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
	
	_openAddDialog: function() {
	    var addDialog = this.querySelector('#addDialog');
	    if (addDialog) {
	        addDialog.open();
	        
	        var arrow = this.querySelector('#arrow');
	        if (arrow) {
	            var _this = this;
                setTimeout(function() {
                    var computedStyle = window.getComputedStyle(addDialog);
                    
                    arrow.style.display = "inline";
                    arrow.style.zIndex = computedStyle.zIndex;
                    _this._positionAddDialogArrow();
                },100);
            }
	    }
	},
	
	_closeAddDialog: function() {
	    if (this.querySelector('#addDialog')) {
	        this.querySelector('#addDialog').close();
	        
	        if (this.querySelector('#arrow')) {
	            this.querySelector('#arrow').style.display = "none";
	        }
	    }
	},
	
	_attachAddDialogArrow: function() {
        var arrow = this.querySelector('#arrow');
        
        if (arrow && arrow.style.display !== "none") {
            var _this = this;
            setTimeout(function() {
                _this._positionAddDialogArrow();
            },100);
        }
	},
	
	_positionAddDialogArrow: function() {
	    var arrow = this.querySelector('#arrow');
	    var computedStyle = window.getComputedStyle(this.querySelector('#addDialog'));
        
	    // May seem like magic numbers, but the 45 here is half the height, and the left positioning is width-1
        arrow.style.top = parseInt(computedStyle.top) + (parseInt(computedStyle.height)/2) - 45 + "px";
        arrow.style.left = parseInt(computedStyle.left) - 89 + "px";
	},
	
    isEqual: function(a, b) {
        // Technically a null/null or undefined/undefined value match, so check for those
        if ((a == null && b == null) || (typeof a === "undefined" && typeof b === "undefined")) {
            return true;
        }
        
        // Otherwise just compare
        return a === b;
    },
    
    _clearDropAreas: function() {
        this.querySelector('#dropDelete').style.opacity = 0;
        this.querySelector('#mainForm').style.borderColor = "transparent";
    },
});