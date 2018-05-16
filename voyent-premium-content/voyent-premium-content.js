Polymer({
	is: "voyent-premium-content",

    properties: {
        hasPremium: {
            type: Boolean,
            value: true,
            observer: '_premiumChanged'
        },
        noPremium: {
            type: Boolean
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
        var _this = this;
        window.addEventListener('account-level-changed', function(e) {
            if (e && e.detail && typeof e.detail.premium !== 'undefined') {
                _this.set('hasPremium', e.detail.premium);
            }
        });
        
        var accountLevel = voyent.$.getSessionStorageItem(btoa("accountLevel"));
        if (typeof accountLevel === 'string') {
            this.set('hasPremium', accountLevel === 'true' ? true : false);
        }
        
        // Override if given the right flag
        // Necessary because specifying a boolean attribute, even with a value of false, is still interpreted by Polymer as true
        // So saying has-premium="false" on the parent page sets true
        if (this.noPremium === true) {
            this.set('hasPremium', false);
        }
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
