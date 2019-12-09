Polymer({
    is: "voyent-loading",

    properties: {
        on: { type: Boolean, value: false, notify: true, reflectToAttribute: true },
        locked: { type: Boolean, value: false, notify: true, reflectToAttribute: true },
        noThrobber: { type: Boolean, value: false, notify: true, reflectToAttribute: true }
    },
    
    ready: function() {
        if (!this.locked) {
            var _this = this;
            window.addEventListener('loading-on',  function(e) {
                _this.on = true;
                
                document.documentElement.style.cursor = 'wait';
            });
            
            window.addEventListener('loading-off',  function(e) {
                _this.on = false;
                
                document.documentElement.style.cursor = 'auto';
            });
        }
    },
});
