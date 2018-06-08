Polymer({
	is: "voyent-premium-content",

    properties: {
        hasPremium: {
            type: Boolean,
            value: false,
            observer: '_premiumChanged'
        },
        noPremium: {
            type: Boolean,
            value: false
        },
        bubblePos: {
            type: String,
            value: 'right' // also uses 'middle'
        },
        style: {
            type: String,
            notify: true
        },
        overlayStyle: {
            type: String,
            notify: true
        },
    },
    
    ready: function() {
        // Override if given the right flag
        // Necessary because specifying a boolean attribute, even with a value of false, is still interpreted by Polymer as true
        // So saying has-premium="false" on the parent page sets true
        if (this.noPremium === true) {
            this.set('hasPremium', false);
        }
        else {
            this.set('hasPremium', true);
        }
        /* TODO Re-enable service level check once we can work out to do it for non-account owners
        else {
            var _this = this;
            voyent.admin.getAccount().then(function(res) {
                if (res && res.serviceLevels && res.serviceLevels.accountType &&
                    typeof res.serviceLevels.accountType.code !== 'undefined') {
                        if (res.serviceLevels.accountType.code === 2) { // Premium
                            _this.set('hasPremium', true);
                        }
                    }
            }).catch(function(error) {
                console.error(error);
            });
        }
        */
    },
    
	attached: function() {
	    this._init();
	},
	
	upgradeClick: function() {
	    window.open("https://voyent-alert.com/ca/voyent-alert-product-comparison/", "_blank");
	},
	
	_init: function() {
        // Cascade through children and disable/enable based on our flag
        var _this = this;
        setTimeout(function() {
            var mainWrap = Polymer.dom(_this.root).querySelector('#premium');
            if (mainWrap) {
                _this._disableChildren(mainWrap);
            }
        },0);
	},
	
	_disableChildren: function(element) {
	    element.disabled = !this.hasPremium; // Base our disabled state on our flag
	    
        if (element.children.length > 0) {
            for (var childLoop = 0; childLoop < element.children.length; childLoop++) {
                this._disableChildren(element.children[childLoop]);
            }
        }
	},
	
	_premiumChanged: function() {
        this._init();
	},
});
