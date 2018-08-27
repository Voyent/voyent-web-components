Polymer({
	is: "voyent-premium-content",

    properties: {
        hasPremium: {
            type: Boolean,
            value: true, // We default to having Premium mainly so we don't see a flicker when the check happens
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
        // Otherwise check our public service for the service level
        else {
            var sourceUrl = ('https:' == document.location.protocol ? 'https://' : 'http://') +
                            voyent.auth.getLastKnownHost() +
                            "/vs/vras/realms/public/serviceLevels?account=" + voyent.auth.getLastKnownAccount();
            
            var _this = this;
            voyent.$.get(sourceUrl).then(function(res) {
                _this.set('hasPremium', false);
                    
                if (res) {
                    res = JSON.parse(res);
                    if (res.serviceLevels && res.serviceLevels.accountType &&
                        typeof res.serviceLevels.accountType.code !== 'undefined') {
                        if (res.serviceLevels.accountType.code === 2) { // Premium
                            _this.set('hasPremium', true);
                        }
                    }
                }
            }).catch(function(error) {
                console.error(error);
                
                _this.set('hasPremium', false);
            });
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
	    if (element) {
            element.disabled = !this.hasPremium; // Base our disabled state on our flag
            
            if (element.children.length > 0) {
                for (var childLoop = 0; childLoop < element.children.length; childLoop++) {
                    this._disableChildren(element.children[childLoop]);
                }
            }
        }
	},
	
	_premiumChanged: function() {
        this._init();
	},
});
