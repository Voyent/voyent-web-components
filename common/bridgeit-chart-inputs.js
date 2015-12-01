var poly;
Polymer({

    is: "bridgeit-chart-inputs",

    properties: {
        independantOptions:Object,
        dependantOptions:Object,
        service:{
            type: String,
            notify: true,
            observer: '_updateVariables'
        },
        configure:String
    },

    created: function () {
        poly = this;
        this.independantOptions = [];
        this.independantOptions["string"] = [];
        this.independantOptions["time"] = [];
        this.independantOptions["number"] = [];
        this.independantOptions["string"]["common"]=["event","type","username","data.origin"];
        this.independantOptions["string"]["storage"]=["data.mimetype","data.originalName"];
        this.independantOptions["string"]["locate"]=[];
        this.independantOptions["string"]["metrics"]=[];
        this.independantOptions["time"]["common"]=["time"];
        this.independantOptions["time"]["storage"]=[];
        this.independantOptions["time"]["locate"]=[];
        this.independantOptions["time"]["metrics"]=[];
        this.independantOptions["number"]["common"]=["data.processTime"];
        this.independantOptions["number"]["storage"]=[];
        this.independantOptions["number"]["locate"]=[];
        this.independantOptions["number"]["metrics"]=[];
        this.dependantOptions = [];
        this.dependantOptions["common"]=["data.processTime"];
        this.dependantOptions["storage"]=["data.size"];
        this.dependantOptions["locate"]=[];
        this.dependantOptions["metrics"]=[];
    },

    ready: function () {
        this._updateVariables();
        //this.$$("#service").onchange = "";
        var startPicker = new Pikaday({field: document.getElementById("startRange")});
        var endPicker = new Pikaday({field: document.getElementById("endRange")});
    },

    //******************PRIVATE API******************
    _updateVariables: function () {
        var dependentElement = this.$$("#dependant");
        var independentElement = this.$$("#independant");
        var service = this.$$("#service").value;
        dependentElement.innerHTML = "";
        independentElement.innerHTML = "";
        var validTypes = this.configure.split(",");
        for (var varType in validTypes) {
            for (var element in this.independantOptions[validTypes[varType]]["common"]) {
                var newOption = document.createElement("option");
                newOption.innerHTML = this.capitalize(this.independantOptions[validTypes[varType]]["common"][element]);
                newOption.value = this.independantOptions[validTypes[varType]]["common"][element];
                if (independentElement.innerHTML == "")
                    newOption.setAttribute("selected", "selected");
                independentElement.appendChild(newOption);
            }
            for (var element in this.independantOptions[validTypes[varType]][service]) {
                var newOption = document.createElement("option");
                newOption.innerHTML = this.capitalize(this.independantOptions[validTypes[varType]][service][element]);
                newOption.value = this.independantOptions[validTypes[varType]][service][element];
                independentElement.appendChild(newOption);
            }
        }
        for (var element in this.dependantOptions["common"]) {
            var newOption = document.createElement("option");
            newOption.innerHTML = this.capitalize(this.dependantOptions["common"][element]);
            newOption.value = this.dependantOptions["common"][element];
            if (dependentElement.innerHTML == "")
                newOption.setAttribute("selected", "selected");
            dependentElement.appendChild(newOption);
        }
        for (var element in this.dependantOptions[service]) {
            var newOption = document.createElement("option");
            newOption.innerHTML = this.capitalize(this.dependantOptions[service][element]);
            newOption.value = this.dependantOptions[service][element];
            dependentElement.appendChild(newOption);
        }
        var selector = document.getElementById("independant");
        if(selector[selector.selectedIndex].value == 'time') document.getElementById('timeVars').style.display=''; else document.getElementById('timeVars').style.display='none';
    },

    capitalize: function(s){
            return s.charAt(0).toUpperCase() + s.slice(1);
    }

});