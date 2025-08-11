var tape = require("tape");

var protobuf = require("..");

var def = {};

var proto = "package ns;\
enum Enm {\
    ONE = 1;\
    TWO = 2;\
}\
message Msg {\
    message Enm {}\
}\
service Svc {}";

tape.test("reflected namespaces", function(test) {

    var ns = protobuf.Namespace.fromJSON("ns", def);
    test.same(ns.toJSON(), def, "should construct from and convert back to JSON");

    var root = protobuf.parse(proto).root;
    ns = root.lookup("ns").resolveAll();
    test.same(ns.getEnum("Enm"), { ONE: 1, TWO: 2 }, "should get enums");

    test.throws(function() {
        ns.getEnum("Msg");
    }, Error, "should throw when getting a message as an enum");

    test.throws(function() {
        ns.getEnum("NOTFOUND");
    }, Error, "should throw when getting null as an enum");

    test.ok(ns.lookupType("Msg"), "should lookup types");

    test.equal(ns.get("Msg").lookupTypeOrEnum("Enm"), ns.lookup(".ns.Msg.Enm"), "should lookup the nearest type or enum");

    test.throws(function() {
        ns.lookupType("Enm");
    }, Error, "should throw when looking up an enum as a type");

    test.throws(function() {
        ns.lookupType("NOTFOUND");
    }, Error, "should throw when looking up null as a type");

    test.ok(ns.lookupEnum("Enm"), "should lookup enums");

    test.throws(function() {
        ns.lookupEnum("Msg");
    }, Error, "should throw when looking up a type as an enum");

    test.throws(function() {
        ns.lookupEnum("NOTFOUND");
    }, Error, "should throw when looking up null as an enum");

    test.ok(ns.lookupService("Svc"), "should lookup services");

    test.throws(function() {
        ns.lookupService("Msg");
    }, Error, "should throw when looking up a type as a service");

    test.throws(function() {
        ns.lookupService("NOTFOUND");
    }, Error, "should throw when looking up null as a service");

    test.equal(ns.lookup(""), ns, "should lookup itself for an empty path");

    test.equal(ns.lookup([]), ns, "should lookup itself for []");

    test.ok(ns.lookup(".") instanceof protobuf.Root, "should lookup root for .");

    test.ok(ns.lookup([""]) instanceof protobuf.Root, "should lookup root for [\"\"]");

    test.throws(function() {
        ns.define(null);
    }, "should throw when path is not a string or array");

    test.throws(function() {
        ns.define(".sub", {});
    }, "should throw when defining absolute .sub");

    test.throws(function() {
        ns.define(["", "sub"], {});
    }, "should throw when defining absolute [\"\", \"sub\"]");

    var sub = ns.define("sub", {});
    test.equal(ns.lookup("sub"), sub, "should define sub namespaces");

    test.throws(function() {
        ns.add(new protobuf.ReflectionObject("invalid"));
    }, TypeError, "should throw when adding invalid nested objects");

    test.throws(function() {
        ns.add(new protobuf.Enum("sub"));
    }, Error, "should throw on duplicate names");

    sub = ns.define("sub.sub");
    test.equal(ns.lookup("sub.sub"), sub, "should define sub sub namespaces");

    test.throws(function() {
        ns.remove(true);
    }, TypeError, "should throw when trying to remove non-reflection objects");

    test.throws(function() {
        ns.remove(new protobuf.Enum("Enm"));
    }, Error, "should throw when trying to remove non-children");

    test.throws(function() {
        ns.add(new protobuf.Enum("MyEnum", {}));
        ns.define("MyEnum");
    }, Error, "should throw when trying to define a path conflicting with non-namespace objects");

    ns = protobuf.Namespace.fromJSON("My", {
        nested: {
            Message: { fields: {} },
            Enum: { values: {} },
            Service: { methods: {} },
            extensionField: { type: "string", id: 1000, extend: "Message" },
            Other: { nested: {} }
        }
    });
    test.same(ns.toJSON(), {
        nested: {
            Message: { fields: {} },
            Enum: { values: {} },
            Service: { methods: {} },
            extensionField: { extend: "Message", id: 1000, type: "string" },
            Other: { }
        }
    }, "should create from Type, Enum, Service, extension Field and Namespace JSON");

    test.end();
});

tape.test("namespace merging with nested namespaces", function(test) {

    // Create a root namespace
    var root = new protobuf.Root();

    // Create first namespace using fromJSON with company.org.team structure
    root.addJSON({
        company: {
            nested: {
                org: {
                    nested: {
                        team: {
                            nested: {
                                sales: {
                                    fields: {
                                        name: { type: "string", id: 1 },
                                        id: { type: "int32", id: 2 }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // Create second namespace using fromJSON with same company.org.team structure
    var companyNS2 = protobuf.Namespace.fromJSON("company", {
        nested: {
            org: {
                nested: {
                    team: {
                        nested: {
                            billing: {
                                fields: {
                                    name: { type: "string", id: 1 },
                                    id: { type: "int32", id: 2 }
                                }
                            }
                        }
                    }
                }
            },
            org2: {
                nested: {
                    squad: {
                        fields: {
                            name: { type: "string", id: 1 },
                            id: { type: "int32", id: 2 }
                        }
                    }
                }
            }
        }
    });

    // Store lookups from the root after ingesting json initially
    const companyOriginal = root.lookup("company");
    const orgOriginal = root.lookup("company.org");
    const teamOriginal = root.lookup("company.org.team");

    const orgNS2 = companyNS2.lookup("org");
    const org2 = companyNS2.lookup("org2");
    const squad = companyNS2.lookup("org2.squad");

    // add the second namespace to the root, forcing merge
    root.add(companyNS2);

    // Verify that the original namespaces are still accessible via lookup
    test.same(root.lookup("company"), companyOriginal, "should still return original company namespace");
    test.same(root.lookup("company.org"), orgOriginal, "should still return original org namespace");
    test.same(root.lookup("company.org.team"), teamOriginal, "should still return original team namespace");
    test.same(root.lookup("company.org.team").nestedArray.map(o => o.name), ['sales', 'billing'], "merged team children are both present");

    // merge resulted in companyNS2 and orgNS2 being discarded.
    test.equal(companyNS2.parent, null, "companyNS2 does not have a parent");
    test.equal(orgNS2.parent, null, "orgNS2 does not have a parent");

    // org2 should have been added as-is to companyOriginal
    test.equal(org2.parent, companyOriginal, "org2 parent is now companyOriginal");
    test.equal(squad.parent, org2, "squad parent is still org2");
    test.same(root.lookup('company.org2.squad'), squad, "the squad object is accessible from root");

    test.end();
});
