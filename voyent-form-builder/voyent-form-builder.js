var ElementType = {
    INPUTANY: "inputAny",
    INPUTLETTERS: "inputLetters",
    INPUTNUM: "inputNum",
    CHECKBOX: "checkbox"
};

Polymer({
	is: "voyent-form-builder",

    properties: {
        toAdd: { type: Object, notify: true },
        value: { type: Object, observer: '_valueChanged', reflectToAttribute: true, notify: true },
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
	            this.value.form[i].index = "index" + i;
	        }
	    }
	},
	
	addElement: function() {
	    this.addReset();
	    
	    this._openAddDialog();
	},
	
	addCancel: function() {
	    // Reset our form and close the dialog
	    this.addClear();
	    this._closeAddDialog();
	},
	
	addClear: function() {
	    this.addReset();
	    this.set('toAdd.type', null);
	},
	
	addReset: function() {
	    this.toAdd = {
            index: null,
	        title: null,
            type: ElementType.INPUTANY,
            description: null,
            minlength: null,
            maxlength: null,
            required: false
	    };
	    
	    // TODO Reset the data backing the add form
	},
	
	addConfirm: function() {
	    // TODO Validate and add the new element
	    // Add a clone to our form details
	    this.push('value.form', JSON.parse(JSON.stringify(this.toAdd)));
	    this.updateIndexes();
	    
	    this.addClear();
	    this._closeAddDialog();
	},
	
    dropToDelete: function(e) {
        if (e && e.dataTransfer) {
            var item = e.dataTransfer.getData("item");
            
            if (item) {
                item = JSON.parse(item);
                for (var i = 0; i < this.value.form.length; i++) {
                    if (item.index === this.value.form[i].index) {
                        this.splice('value.form', i, 1);
                        this.updateIndexes();
                        break;
                    }
                }
            }
        }
        
        this._clearDropAreas();
    },
    
    dropToReorder: function(e) {
        if (e && e.dataTransfer) {
            var item = e.dataTransfer.getData("item");
            
            if (item) {
                // TODO Figure out where the item was dropped in relation to the list, and reorder
            }
        }
        
        this._clearDropAreas();
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
	
	_valueChanged: function(e) {
	    // TODO Something here
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