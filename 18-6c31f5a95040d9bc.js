(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [18],
  {
    4960: function (e, t, l) {
      "use strict";
      (l.r(t),
        l.d(t, {
          default: function () {
            return y;
          },
          getClientIp: function () {
            return j;
          },
        }));
      var n = l(5893),
        o = l(7294),
        a = l(4105),
        s = l(1508),
        r = l(1752),
        i = l.n(r),
        c = l(9332),
        g = l(6486);
      function d(e) {
        let { dataSource: t, onChange: l } = e,
          [a, s] = (0, o.useState)(!1),
          [r, i] = (0, o.useState)(),
          c = (e, t) => {
            (s(!a), i(t), l(e));
          };
        return (0, n.jsx)(n.Fragment, {
          children: (0, n.jsx)("div", {
            children: (0, n.jsxs)("div", {
              className: "dropdown inline-block relative",
              children: [
                (0, n.jsxs)("button", {
                  className:
                    "bg-white shadow-lg font-semibold py-2.5 px-5 rounded-md inline-flex items-center border border-blue",
                  onClick: () => s(!a),
                  children: [
                    (0, n.jsx)("span", {
                      className: "mr-1",
                      children: null != r ? r : "Chọn định dạng",
                    }),
                    (0, n.jsx)("svg", {
                      className: "fill-current h-4 w-4",
                      xmlns: "http://www.w3.org/2000/svg",
                      viewBox: "0 0 20 20",
                      children: (0, n.jsx)("path", {
                        d: "M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z",
                      }),
                    }),
                  ],
                }),
                (0, n.jsx)("ul", {
                  className: "dropdown-menu absolute ".concat(
                    a ? "block" : "hidden",
                    " shadow-lg pt-1",
                  ),
                  children: t.map((e, t) =>
                    (0, n.jsx)(
                      "li",
                      {
                        onClick: () => c(e.value, e.label),
                        children: (0, n.jsx)("a", {
                          className: "".concat(
                            !t && "rounded-t",
                            " bg-white hover:bg-gray-400 py-2 px-4 block whitespace-no-wrap",
                          ),
                          href: "#",
                          children: e.label,
                        }),
                      },
                      t,
                    ),
                  ),
                }),
              ],
            }),
          }),
        });
      }
      var m = l(8626),
        u = l.n(m);
      function h(e) {
        let { dataSource: t } = e;
        return (0, n.jsx)(n.Fragment, {
          children: (0, n.jsxs)("nav", {
            className: u().nav,
            children: [
              (0, n.jsx)("div", {
                className: "".concat(u()["nav-item-def"]),
                children: "File excel mẫu",
              }),
              t.map((e, t) =>
                (0, n.jsx)(
                  "a",
                  {
                    target: "_blank",
                    href: "/files-ex/".concat(e.link),
                    download: !0,
                    className: u()["nav-item"],
                    children: e.label,
                  },
                  t,
                ),
              ),
              (0, n.jsx)("span", { className: u()["nav-indicator"] }),
            ],
          }),
        });
      }
      l(129);
      var p = l(9669),
        f = l.n(p);
      let { publicRuntimeConfig: x } = i()(),
        v = f().create({
          baseURL: x.baseURL,
          headers: {
            Accept: "application/json",
            common: { Authorization: "" },
          },
          timeout: 1e4,
        });
      (v.interceptors.request.use(
        function (e) {
          return e;
        },
        function (e) {
          return Promise.reject(e);
        },
      ),
        v.interceptors.response.use(
          function (e) {
            return (
              200 === e.status ||
                201 === e.status ||
                alert("Unusual behaviour"),
              e
            );
          },
          function (e) {
            if (e) return (console.log(e.response), Promise.reject(e));
          },
        ));
      var b = l(1443);
      let { publicRuntimeConfig: S } = i()(),
        j = async () =>
          await (0, b.zk)({ fallbackUrls: ["https://ifconfig.co/ip"] });
      function y() {
        S.baseURL;
        let [e, t] = (0, o.useState)(""),
          [l, r] = (0, o.useState)(""),
          [i, m] = (0, o.useState)(""),
          [u, p] = (0, o.useState)(""),
          [f, x] = (0, o.useState)(""),
          [v, b] = (0, o.useState)(""),
          [y, N] = (0, o.useState)(""),
          [w, C] = (0, o.useState)(),
          [_] = (0, o.useState)([
            { label: "TNMaker", value: 0 },
            { label: "Young Mix", value: 1 },
            { label: "Intest", value: 2 },
            { label: "Smart Test", value: 3 },
            { label: "Student List", value: 4 },
            { label: "TLTN-BGD-2025-SmartTest", value: 5 },
            { label: "TLTN-BGD-2025-YoungMix", value: 6 },
          ]),
          [k] = (0, o.useState)([
            { label: "TNMaker", link: "TNMaker.xlsx" },
            { label: "Young Mix", link: "Young-Mix.xlsx" },
            { label: "Intest", link: "Intest.xlsx" },
            { label: "Smart Test", link: "Smart-Test.xlsx" },
            { label: "Student List", link: "Student-List.xlsx" },
            {
              label: "TLTN-BGD-2025-SmartTest",
              link: "TLTN-BGD-2025-SmartTest.xlsx",
            },
            {
              label: "TLTN-BGD-2025-YoungMix",
              link: "TLTN-BGD-2025-YoungMix.xlsx",
            },
          ]);
        (0, o.useEffect)(() => {
          j().then((e) => {
            N(e);
          });
        }, []);
        let A = (e) =>
            void 0 === w
              ? c.Z.notify("Định dạng file l\xe0 trường bắt buộc.", {
                  position: "top-right",
                })
              : e.target.files && e.target.files[0]
                ? void T(e.target.files[0])
                : c.Z.notify("Định dạng file l\xe0 trường bắt buộc.", {
                    position: "top-right",
                  }),
          T = (e) => {
            let l = new Promise((t, l) => {
              let n = new FileReader();
              (n.readAsArrayBuffer(e),
                (n.onload = (e) => {
                  let l = e.target.result,
                    n = a.ij(l, { type: "buffer" }),
                    o = n.SheetNames[0],
                    s = n.Sheets[o],
                    r = [],
                    i = {};
                  if (0 === w) {
                    ((s.A1 = O("1")),
                      (s.B1 = O("2")),
                      (s.C1 = O("3")),
                      (s.D1 = O("4")),
                      console.log(
                        (r = a.P6.sheet_to_json(s, { defval: "?" })),
                      ));
                    let { vars: e, objKeys: t } = L(r);
                    i = V(t, e);
                  } else if (1 === w) {
                    ((s.A1 = O("made")),
                      (r = a.P6.sheet_to_json(s, { defval: "?" })));
                    let { vars: e, objKeys: t } = q(r, 1);
                    delete (i = V(t, e)).made;
                  } else if (2 === w) {
                    let e = a.P6.decode_range(s["!ref"]);
                    for (let t = e.s.c; t <= e.e.c; ++t) {
                      var c;
                      let e = a.P6.encode_col(t) + "1";
                      s[e] = O(
                        null == (c = s["".concat(e)].h)
                          ? c
                          : (c = (c = (c = (c = (c = (c = (c = (c =
                              c.toLowerCase()).replace(
                              /à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,
                              "a",
                            )).replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e")).replace(
                              /ì|í|ị|ỉ|ĩ/g,
                              "i",
                            )).replace(
                              /ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,
                              "o",
                            )).replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u")).replace(
                              /ỳ|ý|ỵ|ỷ|ỹ/g,
                              "y",
                            )).replace(/đ/g, "d")).replace(/\s/g, ""),
                      );
                    }
                    r = a.P6.sheet_to_json(s, { defval: "?" });
                    let { vars: t, objKeys: l } = q(r, 2);
                    (delete (i = V(l, t)).made, delete i.stt);
                  } else if (3 === w) {
                    console.log(
                      "data: " +
                        (r = a.P6.sheet_to_json(s, { defval: "?" }))[0],
                    );
                    let { vars: e, objKeys: t } = B(r);
                    delete (i = V(t, e))["C\xe2u"];
                  } else if (4 === w) {
                    ((s.A1 = O("1")),
                      (s.B1 = O("2")),
                      (s.C1 = O("3")),
                      (s.D1 = O("4")),
                      console.log(
                        (r = a.P6.sheet_to_json(s, { defval: "?" })),
                      ));
                    let { objValues: e, objKeys: t } = R(r);
                    i = K(t, e);
                  } else if (5 === w) {
                    r = a.P6.sheet_to_json(s, { defval: "?" });
                    let { vars: e, objKeys: t } = D(r);
                    delete (i = V(t, e))["C\xe2uM\xe3 đề"];
                  } else if (6 === w) {
                    ((s.A1 = O("made")),
                      (r = a.P6.sheet_to_json(s, { defval: "?" })));
                    let { vars: e, objKeys: t } = I(r);
                    delete (i = V(t, e)).made;
                  }
                  t(i);
                }),
                (n.onerror = (e) => l(e)));
            });
            l.then((e) => {
              if (e.temp2)
                c.Z.notify(
                  "Chương tr\xecnh đọc tối đa 24 m\xe3 đề hoặc 100 học sinh. Vui l\xf2ng t\xe1ch l\xe0m nhiều file",
                  { position: "top" },
                );
              else if (e.temp1) {
                let l = e.temp;
                delete e.temp;
                let n = e.temp1;
                delete e.temp1;
                let o = JSON.stringify(e),
                  a = JSON.stringify(l),
                  s = JSON.stringify(n);
                (console.log(o),
                  console.log(a),
                  console.log(s),
                  t(o),
                  r(a),
                  m(s),
                  c.Z.notify(
                    "File c\xf3 nội dung qu\xe1 d\xe0i n\xean được t\xe1ch th\xe0nh nhiều m\xe3 qr.\nVui l\xf2ng d\xf9ng app qu\xe9t nhiều lần.",
                    { position: "top" },
                  ));
              } else if (e.temp) {
                let l = e.temp;
                delete e.temp;
                let n = JSON.stringify(e),
                  o = JSON.stringify(l);
                (console.log(n),
                  console.log(o),
                  t(n),
                  r(o),
                  c.Z.notify(
                    "File c\xf3 nội dung qu\xe1 d\xe0i n\xean được t\xe1ch th\xe0nh nhiều m\xe3 qr.\nVui l\xf2ng d\xf9ng app qu\xe9t nhiều lần.",
                    { position: "top" },
                  ));
              } else
                (r(""),
                  m(""),
                  console.log(JSON.stringify(e)),
                  console.log("data: " + e),
                  t(JSON.stringify(e)));
            });
          },
          L = (e) => {
            let [...t] = e,
              l = [],
              n = [];
            t.map((e) => {
              var t = e[2].toString().replace(/['" ]/gi, "");
              (0, g.includes)(l, t) || (l = [...l, t]);
            });
            for (let e = 0; e < l.length; e++) n[e] = "";
            for (let e = 0; e < t.length; e++)
              for (let r = 0; r < l.length; r++) {
                console.log("objKeys " + l);
                var o = parseInt(l[r]),
                  a = parseInt(t[e][2].toString().replace(/['" ]/gi, ""));
                if (
                  (console.log("numberData " + a + " numberKey" + o),
                  M(o) && o == a)
                ) {
                  let l = t[e][4]
                    .toString()
                    .trim()
                    .toString()
                    .replace(/['" ]/gi, "");
                  console.log("TNMaker newValue: " + l);
                  var s = l.toString().charCodeAt(0);
                  !F(l) && s >= 65 && s <= 69 ? (n[r] += l) : (n[r] += "?");
                }
              }
            return { vars: n, objKeys: l };
          },
          R = (e) => {
            let [...t] = e,
              l = [],
              n = [];
            return (
              t.map((e) => {
                var t = e[3].toString().replace(/['" ]/gi, "");
                (0, g.includes)(l, t) ||
                  ((l = [...l, t]), (n = [...n, e[2].toString()]));
              }),
              console.log("objKeys " + l),
              console.log("objValues " + n),
              { objValues: n, objKeys: l }
            );
          },
          q = (e, t) => {
            let [...l] = e,
              n = [],
              o = [];
            l.map((e) => {
              var t = e.made.toString().replace(/['" ]/gi, "");
              (console.log("item[2]: " + t),
                (0, g.includes)(n, t) || (n = [...n, t]));
            });
            for (let e = 0; e < n.length; e++) o[e] = "";
            var a = 0,
              s = 0;
            for (var r in l[0])
              if (1 == t) {
                if (M(r) && "made" != r && "stt" != r) {
                  s++;
                  var i = l[0][r].toString().charCodeAt(0);
                  i >= 65 && i <= 69 && (a = s);
                }
              } else if (2 == t && !F(r) && "made" != r && "stt" != r) {
                s++;
                var i = l[0][r].toString().charCodeAt(0);
                i >= 65 && i <= 69 && (a = s);
              }
            console.log("numberSentence: " + a);
            for (let e = 0; e < l.length; e++) {
              var s = 0;
              for (var r in l[e])
                if (1 == t) {
                  if (M(r) && "made" != r && "stt" != r && ++s <= a) {
                    var c = l[e][r].toString().trim();
                    let t = c.toString().replace(/['" ]/gi, "");
                    var i = t.toString().charCodeAt(0);
                    !F(t) && i >= 65 && i <= 69 ? (o[e] += t) : (o[e] += "?");
                  }
                } else if (
                  2 == t &&
                  !F(r) &&
                  "made" != r &&
                  "stt" != r &&
                  ++s <= a
                ) {
                  var c = l[e][r].toString().trim();
                  let t = c.toString().replace(/['" ]/gi, "");
                  var i = t.toString().charCodeAt(0);
                  !F(t) && i >= 65 && i <= 69 ? (o[e] += t) : (o[e] += "?");
                }
            }
            return { vars: o, objKeys: n };
          },
          B = (e) => {
            let [...t] = e,
              l = P(t[0]),
              n = [];
            console.log("objectKeys: " + l.length);
            for (let e = 0; e < l.length; e++) M(parseInt(l[e])) && (n[e] = "");
            for (let e = 0; e < t.length; e++)
              for (let a = 0; a < l.length; a++)
                if (M(parseInt(l[a]))) {
                  let s = t[e][l[a]]
                    .toString()
                    .trim()
                    .toString()
                    .replace(/['" ]/gi, "");
                  var o = s.toString().charCodeAt(0);
                  !F(s) && o >= 65 && o <= 69 ? (n[a] += s) : (n[a] += "?");
                } else console.log("objectKeys not isNumeric");
            return (console.log(n), { vars: n, objKeys: l });
          },
          D = (e) => {
            let [...t] = e,
              l = P(t[0]),
              n = [];
            console.log("objectKeys: " + l.length);
            for (let e = 0; e < l.length; e++) M(parseInt(l[e])) && (n[e] = "");
            for (let e = 0; e < l.length; e++) {
              var o = !0,
                a = !0;
              for (let c = 0; c < t.length; c++)
                if (M(parseInt(l[e]))) {
                  let g = t[c][l[e]]
                    .toString()
                    .trim()
                    .toString()
                    .replace(/['" ]/gi, "")
                    .toString()
                    .replace(",", ".");
                  var s,
                    r = g.toString().charCodeAt(0);
                  if (
                    !F(g) &&
                    (((s = r) >= 48 && s <= 57) || (s >= 44 && s <= 46)) &&
                    (console.log(
                      "part30 newValue: " + g + " asciiCharacter:  " + r,
                    ),
                    g.length > 1)
                  ) {
                    var i = g.length - 1;
                    for (
                      console.log("part301 index: " + i);
                      i > 0 && !E(g.charCodeAt(i));
                    )
                      console.log("part31 index: " + --i);
                    (console.log("part32 newValue: " + g + " index:  " + i),
                      (r = (g = g.slice(0, i + 1)).toString().charCodeAt(0)),
                      console.log(
                        "part33 newValue: " + g + " asciiCharacter:  " + r,
                      ));
                  }
                  F(g) ||
                    (console.log("part111 " + g),
                    r >= 65 && r <= 69
                      ? (console.log("part1 " + r), (n[e] += g))
                      : M(g)
                        ? M(g)
                          ? (console.log("part3 " + r),
                            a
                              ? ((n[e] += "#" + g), (a = !1))
                              : (n[e] += "_" + g))
                          : (n[e] += "?")
                        : (console.log("part2 " + r),
                          68 == r && (g = "Đ"),
                          o
                            ? ((n[e] += "#" + g), (o = !1))
                            : (n[e] += "_" + g)));
                }
            }
            return (console.log(n), { vars: n, objKeys: l });
          },
          I = (e) => {
            let [...t] = e,
              l = [],
              n = [];
            t.map((e) => {
              var t = e.made.toString().replace(/['" ]/gi, "");
              (console.log("item[2]: " + t),
                (0, g.includes)(l, t) || (l = [...l, t]));
            });
            for (let e = 0; e < l.length; e++) n[e] = "";
            var o = 0,
              a = 0;
            for (var s in t[0])
              if (
                (console.log("key: " + s + " value: " + t[0][s].toString()),
                M(s) && "made" != s && "stt" != s)
              ) {
                a++;
                var r = t[0][s].toString().charCodeAt(0);
                r >= 65 && r <= 69 && (o = a);
              }
            for (let e = 0; e < t.length; e++) {
              var a = 1,
                i = !0,
                c = !0;
              for (var s in t[e]) {
                console.log(
                  " numberSentence: " +
                    o +
                    " Data key: " +
                    s +
                    " value: " +
                    t[e][s].toString().trim() +
                    " countSentence: " +
                    a,
                );
                let l = t[e][s]
                  .toString()
                  .trim()
                  .toString()
                  .replace(/['" ]/gi, "")
                  .toString()
                  .replace(",", ".");
                var r = l.toString().charCodeAt(0);
                if (a < 41 && M(s) && "made" != s && "stt" != s)
                  a <= o &&
                    (console.log("part1 "),
                    !F(l) && r >= 65 && r <= 69 ? (n[e] += l) : (n[e] += "?"));
                else if (a >= 41 && a < 73 && "made" != s && "stt" != s)
                  (console.log(
                    "part2 newValue: " + l + " asciiCharacter:  " + r,
                  ),
                    !F(l) && r >= 65 && r <= 90
                      ? (68 == r && (l = "Đ"),
                        i
                          ? ((n[e] += "#" + l), (i = !1))
                          : (a - 40 - 1) % 4 == 0
                            ? (n[e] += "_" + l)
                            : (n[e] += l))
                      : r >= 65 && r <= 90 && (n[e] += "?"));
                else if (a >= 73 && a < 81 && "made" != s && "stt" != s) {
                  console.log("part30 newValue: " + l);
                  for (var d = l.length - 1; d > 0 && !E(l.charCodeAt(d)); )
                    console.log("part31 index: " + --d);
                  ((r = (l = l.slice(0, d + 1)).toString().charCodeAt(0)),
                    console.log(
                      "part32 newValue: " + l + " asciiCharacter:  " + r,
                    ),
                    !F(l) && M(l)
                      ? c
                        ? ((n[e] += "#" + l), (c = !1))
                        : (n[e] += "_" + l)
                      : 63 != r && (n[e] += "?"));
                }
                "made" != s && "stt" != s && a++;
              }
            }
            return (console.log(n), { vars: n, objKeys: l });
          },
          P = (e) => (
            Object.keys(e).forEach(function (t) {
              console.log("replaceKeys key: " + t);
              let l = t.replace(/[\s+'" ]/gi, ""),
                n = l.toString();
              (e[t] &&
                "object" == typeof e[t] &&
                (console.log("replaceKeys: " + t), P(e[t])),
                t !== n && ((e[n] = e[t]), delete e[t]));
            }),
            Object.keys(e)
          );
        function M(e) {
          return !isNaN(e) && !isNaN(e - parseFloat(e));
        }
        function E(e) {
          return e >= 48 && e <= 57;
        }
        function F(e) {
          return (
            !!(
              void 0 === e ||
              !e ||
              0 === e.length ||
              "" === e ||
              !/[^\s]/.test(e) ||
              /^\s*$/.test(e)
            ) || "" === e.replace(/\s/g, "")
          );
        }
        let V = (e, t) => {
            let [...l] = t;
            console.log(
              "customRespose objKeys length: " +
                e.length +
                " arr.length: " +
                l.length,
            );
            for (let t = 0; t < e.length; t++)
              M(e[t])
                ? console.log("customRespose isNumeric: " + e[t])
                : console.log("customRespose not isNumeric: " + e[t]);
            var n = { success: !0, type: w };
            (console.log("arr.length: " + l.length),
              l.length > 9 &&
                ((n.temp = {}),
                l.length > 18 &&
                  ((n.temp1 = {}), l.length > 27 && (n.temp2 = {}))));
            for (let t = 0; t < l.length; t++)
              M(e[t]) &&
                (t < 9
                  ? (n[e[t]] = l[t])
                  : t < 18
                    ? ((n.temp.success = !0),
                      (n.temp.type = w),
                      (n.temp[e[t]] = l[t]))
                    : t < 27
                      ? ((n.temp1.success = !0),
                        (n.temp1.type = w),
                        (n.temp1[e[t]] = l[t]))
                      : ((n.temp2.success = !1),
                        (n.temp2.type = w),
                        (n.temp2[e[t]] = l[t])));
            return n;
          },
          K = (e, t) => {
            let [...l] = t;
            console.log(
              "customStudentRespose objKeys length: " +
                e.length +
                " arr.length: " +
                l.length,
            );
            for (let t = 0; t < e.length; t++)
              M(e[t])
                ? console.log("customStudentRespose isNumeric: " + e[t])
                : console.log("customStudentRespose not isNumeric: " + e[t]);
            var n = { success: !0, type: w };
            l.length > 35 &&
              ((n.temp = {}),
              l.length > 70 &&
                ((n.temp1 = {}), l.length > 105 && (n.temp2 = {})));
            for (let t = 0; t < l.length; t++)
              M(e[t]) &&
                (t < 35
                  ? (n[e[t]] = l[t])
                  : t < 70
                    ? ((n.temp.success = !0),
                      (n.temp.type = w),
                      (n.temp[e[t]] = l[t]))
                    : t < 105
                      ? ((n.temp1.success = !0),
                        (n.temp1.type = w),
                        (n.temp1[e[t]] = l[t]))
                      : ((n.temp2.success = !1),
                        (n.temp2.type = w),
                        (n.temp2[e[t]] = l[t])));
            return n;
          },
          O = (e) => ({ t: "s", v: e, r: "<t>".concat(e, "</t>"), h: e, w: e }),
          Z = () => {
            let e = document.getElementById("qrcode"),
              t = e
                .toDataURL("image/png")
                .replace("image/png", "image/octet-stream"),
              l = document.createElement("a");
            ((l.href = t),
              (l.download = "tnmaker-qr.png"),
              document.body.appendChild(l),
              l.click(),
              document.body.removeChild(l));
          },
          z = () => {
            let e = document.getElementById("qrcode1"),
              t = e
                .toDataURL("image/png")
                .replace("image/png", "image/octet-stream"),
              l = document.createElement("a");
            ((l.href = t),
              (l.download = "tnmaker-qr1.png"),
              document.body.appendChild(l),
              l.click(),
              document.body.removeChild(l));
          },
          U = () => {
            let e = document.getElementById("qrcode2"),
              t = e
                .toDataURL("image/png")
                .replace("image/png", "image/octet-stream"),
              l = document.createElement("a");
            ((l.href = t),
              (l.download = "tnmaker-qr2.png"),
              document.body.appendChild(l),
              l.click(),
              document.body.removeChild(l));
          };
        (0, o.useEffect)(() => {
          e && (p(e), e && (x(l), b(i)));
        }, [e, l, i]);
        let J = (e) => {
          (p(""),
            x(""),
            C(e),
            (document.getElementById("fileInput").value = ""));
        };
        return (0, n.jsx)("div", {
          className: "mx-3",
          children: (0, n.jsxs)("div", {
            className:
              "flex flex-col w-full h-screen items-center justify-center bg-grey-lighter",
            children: [
              (0, n.jsx)(h, { dataSource: k }),
              (0, n.jsxs)("div", {
                className: "flex mt-10",
                children: [
                  (0, n.jsx)("div", {
                    className: "mr-2",
                    children: (0, n.jsx)(d, { dataSource: _, onChange: J }),
                  }),
                  (0, n.jsx)("div", {
                    children: (0, n.jsxs)("label", {
                      className:
                        "w-64 flex flex-col items-center px-4 py-6 bg-white text-blue rounded-lg shadow-lg tracking-wide uppercase border border-blue cursor-pointer hover:bg-blue hover:text-white",
                      children: [
                        (0, n.jsx)("svg", {
                          className: "w-8 h-8",
                          fill: "currentColor",
                          xmlns: "http://www.w3.org/2000/svg",
                          viewBox: "0 0 20 20",
                          children: (0, n.jsx)("path", {
                            d: "M16.88 9.1A4 4 0 0 1 16 17H5a5 5 0 0 1-1-9.9V7a3 3 0 0 1 4.52-2.59A4.98 4.98 0 0 1 17 8c0 .38-.04.74-.12 1.1zM11 11h3l-4-4-4 4h3v3h2v-3z",
                          }),
                        }),
                        (0, n.jsx)("span", {
                          className: "mt-2 text-base leading-normal",
                          children: "Select a file",
                        }),
                        (0, n.jsx)("input", {
                          id: "fileInput",
                          type: "file",
                          className: "hidden",
                          onChange: A,
                          accept:
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel",
                        }),
                      ],
                    }),
                  }),
                ],
              }),
              (0, n.jsxs)("div", {
                className: "flex mt-10",
                children: [
                  (0, n.jsx)("div", {
                    className: "row m-10",
                    children:
                      u &&
                      (0, n.jsxs)(n.Fragment, {
                        children: [
                          (0, n.jsx)("div", {
                            className: "mt-6",
                            children: (0, n.jsx)(s.ZP, {
                              id: "qrcode",
                              value: u,
                              size: 300,
                              level: "H",
                              imageSettings: {
                                src: "/images/logo.png",
                                x: null,
                                y: null,
                                height: 24,
                                width: 24,
                                excavate: !0,
                              },
                            }),
                          }),
                          (0, n.jsx)("div", {
                            className: "col-xs-1 text-center mt-6",
                            children: (0, n.jsx)("button", {
                              type: "button",
                              className:
                                "focus:outline-none text-white text-sm py-2.5 px-5 rounded-md bg-gradient-to-r from-blue-400 to-blue-600 transform hover:scale-110",
                              onClick: Z,
                              children: "Download QRCode",
                            }),
                          }),
                        ],
                      }),
                  }),
                  (0, n.jsx)("div", {
                    className: "row m-10",
                    children:
                      f &&
                      (0, n.jsxs)(n.Fragment, {
                        children: [
                          (0, n.jsx)("div", {
                            className: "mt-6",
                            children: (0, n.jsx)(s.ZP, {
                              id: "qrcode1",
                              value: f,
                              size: 300,
                              level: "H",
                              imageSettings: {
                                src: "/images/logo.png",
                                x: null,
                                y: null,
                                height: 24,
                                width: 24,
                                excavate: !0,
                              },
                            }),
                          }),
                          (0, n.jsx)("div", {
                            className: "col-xs-1 text-center mt-6",
                            children: (0, n.jsx)("button", {
                              type: "button",
                              className:
                                "focus:outline-none text-white text-sm py-2.5 px-5 rounded-md bg-gradient-to-r from-blue-400 to-blue-600 transform hover:scale-110",
                              onClick: z,
                              children: "Download QRCode1",
                            }),
                          }),
                        ],
                      }),
                  }),
                  (0, n.jsx)("div", {
                    className: "row m-10",
                    children:
                      v &&
                      (0, n.jsxs)(n.Fragment, {
                        children: [
                          (0, n.jsx)("div", {
                            className: "mt-6",
                            children: (0, n.jsx)(s.ZP, {
                              id: "qrcode2",
                              value: v,
                              size: 300,
                              level: "H",
                              imageSettings: {
                                src: "/images/logo.png",
                                x: null,
                                y: null,
                                height: 24,
                                width: 24,
                                excavate: !0,
                              },
                            }),
                          }),
                          (0, n.jsx)("div", {
                            className: "col-xs-1 text-center mt-6",
                            children: (0, n.jsx)("button", {
                              type: "button",
                              className:
                                "focus:outline-none text-white text-sm py-2.5 px-5 rounded-md bg-gradient-to-r from-blue-400 to-blue-600 transform hover:scale-110",
                              onClick: U,
                              children: "Download QRCode2",
                            }),
                          }),
                        ],
                      }),
                  }),
                ],
              }),
            ],
          }),
        });
      }
    },
    8626: function (e) {
      e.exports = {
        nav: "tab_nav__m_CBk",
        "nav-item": "tab_nav-item__iX_w6",
        "is-active": "tab_is-active__1nv2Z",
        "nav-indicator": "tab_nav-indicator__F9FAb",
        "nav-item-def": "tab_nav-item-def__hOS6h",
      };
    },
    4654: function () {},
    3963: function () {},
    5103: function () {},
    2061: function () {},
  },
]);
