import type { CodingQuestion } from './types.ts'
import type { CompiledCodeLang } from './languages.ts'
import { expandTestArgs } from './generators.ts'
import { nativeSignature, nativeShapeTypes } from './codeTemplates.ts'

export interface NativeHarness {
  filename: string
  source: string
  caseCount: number
}

const { cppType, javaType, rustType, goType, cType } = nativeShapeTypes

function assertIdentifier(name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Invalid function name: ${name}`)
}

function cppRawString(value: string, index: number): string {
  let tag = `CASES${index}`
  while (value.includes(`)${tag}"`)) tag += 'X'
  return `R"${tag}(${value})${tag}"`
}

function sourceString(value: string): string {
  let out = '"'
  for (const ch of value) {
    const code = ch.codePointAt(0) || 0
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20) out += `\\u{${code.toString(16)}}`
    else out += ch
  }
  return out + '"'
}

function javaConvert(shape: any, expression: string): string {
  if (shape.kind === 'array') {
    const child = shape.item || { kind: 'number', decimal: false, wide: false }
    const method = child.kind === 'array'
      ? child.item?.kind === 'string' ? 'asStringMatrix' : child.item?.decimal ? 'asDoubleMatrix' : 'asIntMatrix'
      : child.kind === 'string' ? 'asStringArray'
        : child.kind === 'boolean' ? 'asBooleanArray'
          : child.decimal ? 'asDoubleArray' : 'asLongArray'
    return `Judge.${method}(${expression})`
  }
  if (shape.kind === 'string') return `Judge.asString(${expression})`
  if (shape.kind === 'boolean') return `Judge.asBoolean(${expression})`
  if (shape.kind === 'number') return shape.decimal ? `Judge.asDouble(${expression})` : `Judge.asLong(${expression})`
  return `Judge.asLong(${expression})`
}

function rustConvert(shape: any, expression: string): string {
  if (shape.kind === 'array') return `from_json::<${rustType(shape)}>(${expression})`
  if (shape.kind === 'number') return shape.decimal ? `from_json::<f64>(${expression})` : `from_json::<i64>(${expression})`
  if (shape.kind === 'boolean') return `from_json::<bool>(${expression})`
  if (shape.kind === 'string') return `from_json::<String>(${expression})`
  return `from_json::<i64>(${expression})`
}

function goConvert(shape: any, expression: string): string {
  if (shape.kind === 'array') {
    const child = shape.item || { kind: 'number', decimal: false }
    const method = child.kind === 'array'
      ? child.item?.kind === 'string' ? 'asStringMatrix' : child.item?.decimal ? 'asFloatMatrix' : 'asIntMatrix'
      : child.kind === 'string' ? 'asStringSlice'
        : child.kind === 'boolean' ? 'asBoolSlice'
          : child.decimal ? 'asFloatSlice' : 'asIntSlice'
    return `${method}(${expression})`
  }
  if (shape.kind === 'string') return `asString(${expression})`
  if (shape.kind === 'boolean') return `asBool(${expression})`
  if (shape.kind === 'number') return shape.decimal ? `asFloat(${expression})` : `asInt(${expression})`
  return `asInt(${expression})`
}

function cppHelpers() {
  return String.raw`
#include <bits/stdc++.h>
using namespace std;
struct JsonValue { enum Kind { Null, Boolean, Number, String, Array } kind = Null; bool boolean = false; string text; vector<JsonValue> array; };
struct JsonParser {
  const string& s; size_t p = 0;
  explicit JsonParser(const string& input) : s(input) {}
  void ws() { while (p < s.size() && isspace((unsigned char)s[p])) ++p; }
  string str() {
    string out; ++p;
    while (p < s.size()) {
      char c = s[p++]; if (c == '"') break;
      if (c != '\\') { out += c; continue; }
      if (p >= s.size()) break;
      char e = s[p++];
      if (e == '"' || e == '\\' || e == '/') out += e;
      else if (e == 'b') out += '\b'; else if (e == 'f') out += '\f'; else if (e == 'n') out += '\n'; else if (e == 'r') out += '\r'; else if (e == 't') out += '\t';
      else if (e == 'u' && p + 4 <= s.size()) {
        unsigned int code = 0; for (int i = 0; i < 4; ++i) { char h = s[p++]; code = code * 16 + (h >= '0' && h <= '9' ? h - '0' : (tolower(h) - 'a' + 10)); }
        if (code < 0x80) out += (char)code;
        else if (code < 0x800) { out += (char)(0xc0 | (code >> 6)); out += (char)(0x80 | (code & 63)); }
        else { out += (char)(0xe0 | (code >> 12)); out += (char)(0x80 | ((code >> 6) & 63)); out += (char)(0x80 | (code & 63)); }
      }
    }
    return out;
  }
  JsonValue value() {
    ws(); JsonValue v; if (p >= s.size()) return v;
    char c = s[p];
    if (c == '"') { v.kind = JsonValue::String; v.text = str(); return v; }
    if (c == '[') { v.kind = JsonValue::Array; ++p; ws(); if (p < s.size() && s[p] == ']') { ++p; return v; } while (p < s.size()) { v.array.push_back(value()); ws(); if (p < s.size() && s[p] == ',') { ++p; continue; } if (p < s.size() && s[p] == ']') ++p; break; } return v; }
    if (s.compare(p, 4, "true") == 0) { v.kind = JsonValue::Boolean; v.boolean = true; p += 4; return v; }
    if (s.compare(p, 5, "false") == 0) { v.kind = JsonValue::Boolean; p += 5; return v; }
    if (s.compare(p, 4, "null") == 0) { p += 4; return v; }
    v.kind = JsonValue::Number; size_t start = p; if (s[p] == '-') ++p; while (p < s.size() && (isdigit((unsigned char)s[p]) || s[p] == '.' || s[p] == 'e' || s[p] == 'E' || s[p] == '+' || s[p] == '-')) ++p; v.text = s.substr(start, p - start); return v;
  }
};
template<class T> struct JsonDecoder;
template<> struct JsonDecoder<long long> { static long long get(const JsonValue& v) { return stoll(v.text); } };
template<> struct JsonDecoder<double> { static double get(const JsonValue& v) { return stod(v.text); } };
template<> struct JsonDecoder<bool> { static bool get(const JsonValue& v) { return v.boolean; } };
template<> struct JsonDecoder<string> { static string get(const JsonValue& v) { return v.text; } };
template<class T> struct JsonDecoder<vector<T>> { static vector<T> get(const JsonValue& v) { vector<T> out; out.reserve(v.array.size()); for (const auto& x : v.array) out.push_back(JsonDecoder<T>::get(x)); return out; } };
template<class T> T fromJson(const JsonValue& v) { return JsonDecoder<T>::get(v); }
static string jsonString(const string& s) { string out = "\""; for (unsigned char c : s) { if (c == '"') out += "\\\""; else if (c == '\\') out += "\\\\"; else if (c == '\n') out += "\\n"; else if (c == '\r') out += "\\r"; else if (c == '\t') out += "\\t"; else if (c < 32) { char b[8]; snprintf(b, sizeof(b), "\\u%04x", c); out += b; } else out += (char)c; } return out + "\""; }
inline string toJson(const string& x) { return jsonString(x); }
inline string toJson(const char* x) { return jsonString(x ? string(x) : string()); }
inline string toJson(bool x) { return x ? "true" : "false"; }
inline string toJson(double x) { if (!isfinite(x)) return "null"; ostringstream s; s << setprecision(17) << x; return s.str(); }
inline string toJson(float x) { return toJson((double)x); }
inline string toJson(long long x) { return to_string(x); }
inline string toJson(int x) { return to_string(x); }
template<class T> string toJson(const vector<T>& xs) { string out = "["; for (size_t i = 0; i < xs.size(); ++i) { if (i) out += ","; out += toJson(xs[i]); } return out + "]"; }
`
}

function cppHarness(q: CodingQuestion, code: string, marker: string): NativeHarness {
  const sig = nativeSignature(q, 'cpp')
  assertIdentifier(sig.functionName)
  const cases = q.tests.map((test, index) => cppRawString(JSON.stringify(expandTestArgs(test.args)), index))
  const declarations = sig.params.map((shape, index) => `${cppType(shape)} arg${index} = fromJson<${cppType(shape)}>(args.array.at(${index}));`).join('\n  ')
  const args = sig.params.map((_, index) => `arg${index}`).join(', ')
  const source = `${cppHelpers()}\nstatic const vector<string> CASES = {${cases.join(',\n')}};\n${code}\nint main(int argc, char** argv) {\n  int index = argc > 1 ? atoi(argv[1]) : 0; if (index < 0 || index >= (int)CASES.size()) return 2;\n  JsonParser parser(CASES[index]); JsonValue args = parser.value();\n  ${declarations}\n  auto result = ${sig.functionName}(${args});\n  cout << ${JSON.stringify(marker)} << toJson(result) << endl;\n  return 0;\n}\n`
  return { filename: 'Main.cpp', source, caseCount: q.tests.length }
}

function javaHelpers(extraImports = '') {
  return String.raw`
import java.util.*;
import java.lang.reflect.Array;
${extraImports}
class JsonParser {
  final String s; int p = 0; JsonParser(String s) { this.s=s; }
  void ws(){ while(p<s.length() && Character.isWhitespace(s.charAt(p))) p++; }
  Object parse(){ ws(); if(p>=s.length()) return null; char c=s.charAt(p);
    if(c=='"') return string();
    if(c=='['){ p++; List<Object> a=new ArrayList<>(); ws(); if(p<s.length()&&s.charAt(p)==']'){p++;return a;} while(p<s.length()){a.add(parse());ws();if(p<s.length()&&s.charAt(p)==','){p++;continue;}if(p<s.length()&&s.charAt(p)==']')p++;break;}return a; }
    if(s.startsWith("true",p)){p+=4;return true;} if(s.startsWith("false",p)){p+=5;return false;} if(s.startsWith("null",p)){p+=4;return null;}
    int start=p; while(p<s.length() && "-+0123456789.eE".indexOf(s.charAt(p))>=0)p++; String n=s.substring(start,p); if(n.indexOf('.')>=0||n.indexOf('e')>=0||n.indexOf('E')>=0)return Double.valueOf(n); return Long.valueOf(n);
  }
  String string(){p++;StringBuilder b=new StringBuilder();while(p<s.length()){char c=s.charAt(p++);if(c=='"')break;if(c!='\\'){b.append(c);continue;}char e=s.charAt(p++);switch(e){case '"':b.append('"');break;case '\\':b.append('\\');break;case '/':b.append('/');break;case 'b':b.append('\b');break;case 'f':b.append('\f');break;case 'n':b.append('\n');break;case 'r':b.append('\r');break;case 't':b.append('\t');break;case 'u':b.append((char)Integer.parseInt(s.substring(p,p+4),16));p+=4;break;}}return b.toString();
  }
}
class Judge {
static long asLong(Object x){return ((Number)x).longValue();} static int asInt(Object x){return ((Number)x).intValue();} static double asDouble(Object x){return ((Number)x).doubleValue();} static boolean asBoolean(Object x){return (Boolean)x;} static String asString(Object x){return (String)x;}
static int[] asIntArray(Object x){List<?> a=(List<?>)x;int[] r=new int[a.size()];for(int i=0;i<r.length;i++)r[i]=asInt(a.get(i));return r;}
static long[] asLongArray(Object x){List<?> a=(List<?>)x;long[] r=new long[a.size()];for(int i=0;i<r.length;i++)r[i]=asLong(a.get(i));return r;}
static double[] asDoubleArray(Object x){List<?> a=(List<?>)x;double[] r=new double[a.size()];for(int i=0;i<r.length;i++)r[i]=asDouble(a.get(i));return r;}
static boolean[] asBooleanArray(Object x){List<?> a=(List<?>)x;boolean[] r=new boolean[a.size()];for(int i=0;i<r.length;i++)r[i]=asBoolean(a.get(i));return r;}
static String[] asStringArray(Object x){List<?> a=(List<?>)x;String[] r=new String[a.size()];for(int i=0;i<r.length;i++)r[i]=asString(a.get(i));return r;}
static int[][] asIntMatrix(Object x){List<?> a=(List<?>)x;int[][] r=new int[a.size()][];for(int i=0;i<r.length;i++)r[i]=asIntArray(a.get(i));return r;}
static long[][] asLongMatrix(Object x){List<?> a=(List<?>)x;long[][] r=new long[a.size()][];for(int i=0;i<r.length;i++)r[i]=asLongArray(a.get(i));return r;}
static double[][] asDoubleMatrix(Object x){List<?> a=(List<?>)x;double[][] r=new double[a.size()][];for(int i=0;i<r.length;i++)r[i]=asDoubleArray(a.get(i));return r;}
static String[][] asStringMatrix(Object x){List<?> a=(List<?>)x;String[][] r=new String[a.size()][];for(int i=0;i<r.length;i++)r[i]=asStringArray(a.get(i));return r;}
static String quote(String s){StringBuilder b=new StringBuilder("\"");for(int i=0;i<s.length();i++){char c=s.charAt(i);if(c=='"')b.append("\\\"");else if(c=='\\')b.append("\\\\");else if(c=='\n')b.append("\\n");else if(c=='\r')b.append("\\r");else if(c=='\t')b.append("\\t");else if(c<32)b.append(String.format("\\u%04x",(int)c));else b.append(c);}return b.append('"').toString();}
static String json(Object x){if(x==null)return "null";if(x instanceof String)return quote((String)x);if(x instanceof Boolean||x instanceof Number)return x.toString();if(x.getClass().isArray()){int n=Array.getLength(x);StringBuilder b=new StringBuilder("[");for(int i=0;i<n;i++){if(i>0)b.append(',');b.append(json(Array.get(x,i)));}return b.append(']').toString();}if(x instanceof Iterable){StringBuilder b=new StringBuilder("[");boolean first=true;for(Object v:(Iterable<?>)x){if(!first)b.append(',');first=false;b.append(json(v));}return b.append(']').toString();}return quote(x.toString());}
}
`
}

function javaStringLiteral(value: string): string {
  let out = '"'
  for (const char of value) {
    const code = char.codePointAt(0) || 0
    if (char === '"') out += '\\"'
    else if (char === '\\') out += '\\\\'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === '\t') out += '\\t'
    else if (char === '\b') out += '\\b'
    else if (char === '\f') out += '\\f'
    else if (code < 0x20 || code === 0x7f) out += `\\${code.toString(8).padStart(3, '0')}`
    else out += char
  }
  return out + '"'
}

function javaStringExpression(value: string): string {
  // A Java class-file string constant is limited to 65,535 modified UTF-8
  // bytes. Large generated test inputs (e.g. 100,000 integers) must therefore
  // be assembled at runtime from small literals rather than one giant constant.
  const chunks: string[] = []
  let chunk = ''
  for (const char of value) {
    if (chunk.length + char.length > 8000) { chunks.push(chunk); chunk = '' }
    chunk += char
  }
  if (chunk || chunks.length === 0) chunks.push(chunk)
  return `joinCase(${chunks.map(javaStringLiteral).join(', ')})`
}

function javaHarness(q: CodingQuestion, code: string, marker: string): NativeHarness {
  const sig = nativeSignature(q, 'java')
  assertIdentifier(sig.functionName)
  const cases = q.tests.map((test) => JSON.stringify(expandTestArgs(test.args)))
  const calls = sig.params.map((shape, index) => javaConvert(shape, `args.get(${index})`)).join(', ')
  const extraImports = (code.match(/^\s*import\s+[^;]+;\s*$/gm) || []).map((value) => value.trim()).join('\n')
  const candidate = code.replace(/^\s*import\s+[^;]+;\s*$/gm, '').replace(/^\s*package\s+[A-Za-z0-9_.]+;\s*/m, '')
  const source = `${javaHelpers(extraImports)}\nclass Solution {\n${candidate}\n}\npublic class Main {\n  static final String[] CASES = new String[]{${cases.map(javaStringExpression).join(',\n')}};\n  static String joinCase(String... parts) { StringBuilder value = new StringBuilder(); for (String part : parts) value.append(part); return value.toString(); }\n  public static void main(String[] argv) {\n    int index = argv.length>0 ? Integer.parseInt(argv[0]) : 0;\n    Object raw = new JsonParser(CASES[index]).parse(); List<?> args=(List<?>)raw;\n    Solution solution=new Solution(); Object result=solution.${sig.functionName}(${calls});\n    System.out.println(${JSON.stringify(marker)} + Judge.json(result));\n  }\n}\n`
  return { filename: 'Main.java', source, caseCount: q.tests.length }
}
function rustHelpers() {
  return String.raw`
use std::env;
use std::collections::{HashMap, HashSet, BTreeMap, BTreeSet, BinaryHeap, VecDeque};
use std::cmp::{Reverse, Ordering};
#[derive(Clone,Debug)] enum J { Null, Bool(bool), Num(String), Str(String), Arr(Vec<J>) }
struct Parser { c: Vec<char>, p: usize }
impl Parser {
 fn new(s:&str)->Self{Self{c:s.chars().collect(),p:0}}
 fn ws(&mut self){while self.p<self.c.len()&&self.c[self.p].is_whitespace(){self.p+=1}}
 fn string(&mut self)->String{self.p+=1;let mut out=String::new();while self.p<self.c.len(){let c=self.c[self.p];self.p+=1;if c=='"'{break;}if c!='\\'{out.push(c);continue;}if self.p>=self.c.len(){break;}let e=self.c[self.p];self.p+=1;match e{'"'=>out.push('"'),'\\'=>out.push('\\'),'/'=>out.push('/'),'b'=>out.push('\u{8}'),'f'=>out.push('\u{c}'),'n'=>out.push('\n'),'r'=>out.push('\r'),'t'=>out.push('\t'),'u'=>{let mut code=0u32;for _ in 0..4{if self.p>=self.c.len(){break;}code=code*16+self.c[self.p].to_digit(16).unwrap_or(0);self.p+=1;}if let Some(x)=char::from_u32(code){out.push(x);}},_=>out.push(e)}}out}
 fn value(&mut self)->J{self.ws();if self.p>=self.c.len(){return J::Null;}let c=self.c[self.p];if c=='"'{return J::Str(self.string());}if c=='['{self.p+=1;let mut a=Vec::new();self.ws();if self.p<self.c.len()&&self.c[self.p]==']'{self.p+=1;return J::Arr(a);}loop{a.push(self.value());self.ws();if self.p>=self.c.len(){break;}if self.c[self.p]==','{self.p+=1;continue;}if self.c[self.p]==']'{self.p+=1;break;}}return J::Arr(a);}if c=='t'{self.p+=4;return J::Bool(true);}if c=='f'{self.p+=5;return J::Bool(false);}if c=='n'{self.p+=4;return J::Null;}let start=self.p;if c=='-'{self.p+=1;}while self.p<self.c.len()&&("0123456789.eE+-".contains(self.c[self.p])){self.p+=1;}J::Num(self.c[start..self.p].iter().collect())}
}
trait FromJ { fn from_j(v:&J)->Self; }
fn from_json<T:FromJ>(v:&J)->T{T::from_j(v)}
impl FromJ for i64{fn from_j(v:&J)->Self{if let J::Num(s)=v{s.parse().unwrap_or(0)}else{0}}}
impl FromJ for i32{fn from_j(v:&J)->Self{from_json::<i64>(v) as i32}}
impl FromJ for f64{fn from_j(v:&J)->Self{if let J::Num(s)=v{s.parse().unwrap_or(0.0)}else{0.0}}}
impl FromJ for bool{fn from_j(v:&J)->Self{if let J::Bool(b)=v{*b}else{false}}}
impl FromJ for String{fn from_j(v:&J)->Self{if let J::Str(s)=v{s.clone()}else{String::new()}}}
impl<T:FromJ> FromJ for Vec<T>{fn from_j(v:&J)->Self{if let J::Arr(a)=v{a.iter().map(T::from_j).collect()}else{Vec::new()}}}
trait JsonOut{fn json(&self)->String;}
fn quote_json(s:&str)->String{let mut out=String::from("\"");for c in s.chars(){match c{'"'=>out.push_str("\\\""),'\\'=>out.push_str("\\\\"),'\n'=>out.push_str("\\n"),'\r'=>out.push_str("\\r"),'\t'=>out.push_str("\\t"),c if c<' '=>out.push_str(&format!("\\u{:04x}",c as u32)),c=>out.push(c)}}out.push('"');out}
impl JsonOut for i64{fn json(&self)->String{self.to_string()}} impl JsonOut for i32{fn json(&self)->String{self.to_string()}} impl JsonOut for usize{fn json(&self)->String{self.to_string()}} impl JsonOut for bool{fn json(&self)->String{self.to_string()}} impl JsonOut for String{fn json(&self)->String{quote_json(self)}} impl JsonOut for f64{fn json(&self)->String{if self.is_finite(){self.to_string()}else{"null".into()}}}
impl<T:JsonOut> JsonOut for Vec<T>{fn json(&self)->String{format!("[{}]",self.iter().map(|x|x.json()).collect::<Vec<_>>().join(","))}}
`
}

function rustHarness(q: CodingQuestion, code: string, marker: string): NativeHarness {
  const sig = nativeSignature(q, 'rust')
  assertIdentifier(sig.functionName)
  const cases = q.tests.map((test) => sourceString(JSON.stringify(expandTestArgs(test.args))))
  const calls = sig.params.map((shape, index) => rustConvert(shape, `&args[${index}]`)).join(', ')
  const source = `${rustHelpers()}\nstatic CASES: &[&str] = &[${cases.join(',')}];\n${code}\nfn main(){let ix:usize=env::args().nth(1).unwrap_or("0".into()).parse().unwrap_or(0);let mut p=Parser::new(CASES[ix]);let root=p.value();let args=match root{J::Arr(a)=>a,_=>Vec::new()};let result=${sig.functionName}(${calls});println!("{}{}",${JSON.stringify(marker)},result.json());}\n`
  return { filename: 'main.rs', source, caseCount: q.tests.length }
}

function goHelpers() {
  return String.raw`
package main
import (
  "encoding/json"
  "fmt"
  "os"
  "strconv"
  "bytes"
  "container/heap"
  "container/list"
  "math"
  "sort"
  "strings"
  "unicode"
  "unicode/utf8"
  "reflect"
)
var (
  _ = bytes.Compare
  _ = heap.Init
  _ = list.New
  _ = math.MaxFloat64
  _ = sort.Ints
  _ = strings.Builder{}
  _ = unicode.IsLetter
  _ = utf8.RuneCountInString
)
func normalizeResult(v any) any {
  value := reflect.ValueOf(v)
  if !value.IsValid() { return nil }
  if value.Kind() == reflect.Slice || value.Kind() == reflect.Array {
    result := make([]any, value.Len())
    for i := 0; i < value.Len(); i++ { result[i] = normalizeResult(value.Index(i).Interface()) }
    return result
  }
  return v
}
func asInt(v any) int64 { return int64(v.(float64)) }
func asFloat(v any) float64 { return v.(float64) }
func asBool(v any) bool { return v.(bool) }
func asString(v any) string { return v.(string) }
func asIntSlice(v any) []int64 { a:=v.([]any);r:=make([]int64,len(a));for i,x:=range a{r[i]=asInt(x)};return r }
func asFloatSlice(v any) []float64 { a:=v.([]any);r:=make([]float64,len(a));for i,x:=range a{r[i]=asFloat(x)};return r }
func asBoolSlice(v any) []bool { a:=v.([]any);r:=make([]bool,len(a));for i,x:=range a{r[i]=asBool(x)};return r }
func asStringSlice(v any) []string { a:=v.([]any);r:=make([]string,len(a));for i,x:=range a{r[i]=asString(x)};return r }
func asIntMatrix(v any) [][]int64 { a:=v.([]any);r:=make([][]int64,len(a));for i,x:=range a{r[i]=asIntSlice(x)};return r }
func asFloatMatrix(v any) [][]float64 { a:=v.([]any);r:=make([][]float64,len(a));for i,x:=range a{r[i]=asFloatSlice(x)};return r }
func asStringMatrix(v any) [][]string { a:=v.([]any);r:=make([][]string,len(a));for i,x:=range a{r[i]=asStringSlice(x)};return r }
`
}

function goHarness(q: CodingQuestion, code: string, marker: string): NativeHarness {
  const sig = nativeSignature(q, 'go')
  assertIdentifier(sig.functionName)
  const cases = q.tests.map((test) => JSON.stringify(expandTestArgs(test.args)))
  const calls = sig.params.map((shape, index) => goConvert(shape, `args[${index}]`)).join(', ')
  const source = `${goHelpers()}\nvar testCases=[]string{${cases.map((value) => JSON.stringify(value)).join(',')}}\n${code}\nfunc main(){ix:=0;if len(os.Args)>1{ix,_=strconv.Atoi(os.Args[1])};var args []any;if err:=json.Unmarshal([]byte(testCases[ix]),&args);err!=nil{panic(err)};result:=${sig.functionName}(${calls});out,err:=json.Marshal(normalizeResult(result));if err!=nil{panic(err)};fmt.Printf("%s%s\\n",${JSON.stringify(marker)},string(out))}\n`
  return { filename: 'main.go', source, caseCount: q.tests.length }
}

const C_TYPES = String.raw`
typedef struct { long long *data; size_t len; } LongArray;
typedef struct { LongArray *data; size_t len; } LongMatrix;
typedef struct { double *data; size_t len; } DoubleArray;
typedef struct { DoubleArray *data; size_t len; } DoubleMatrix;
typedef struct { char **data; size_t len; } StringArray;
typedef struct { StringArray *data; size_t len; } StringMatrix;
`

function cConvert(shape: any, expression: string): string {
  if (shape.kind === 'array') {
    const child = shape.item || { kind: 'number', decimal: false }
    const method = child.kind === 'array'
      ? child.item?.kind === 'string' ? 'asStringMatrix' : child.item?.decimal ? 'asDoubleMatrix' : 'asLongMatrix'
      : child.kind === 'string' ? 'asStringArray' : child.decimal ? 'asDoubleArray' : 'asLongArray'
    return `${method}(${expression})`
  }
  if (shape.kind === 'string') return `asString(${expression})`
  if (shape.kind === 'boolean') return `asBoolean(${expression})`
  if (shape.kind === 'number') return shape.decimal ? `asDouble(${expression})` : `asLong(${expression})`
  return '0'
}

function cHelpers() {
  return String.raw`#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>
#include <ctype.h>
#include <math.h>
${C_TYPES}
typedef enum { JNULL, JBOOL, JNUM, JSTRING, JARRAY } JKind;
typedef struct JVal { JKind kind; bool boolean; char *text; struct JVal *items; size_t len; } JVal;
typedef struct { const char *s; size_t p; } Parser;
static void skipws(Parser *p) { while (p->s[p->p] && isspace((unsigned char)p->s[p->p])) p->p++; }
static void pushbyte(char **s, size_t *n, size_t *cap, unsigned char c) {
  if (*n + 1 >= *cap) { *cap = *cap ? *cap * 2 : 32; *s = (char*)realloc(*s, *cap); }
  (*s)[(*n)++] = (char)c; (*s)[*n] = 0;
}
static char *parseString(Parser *p) {
  p->p++; char *out = NULL; size_t n = 0, cap = 0;
  while (p->s[p->p]) {
    unsigned char c = (unsigned char)p->s[p->p++];
    if (c == '"') break;
    if (c != '\\') { pushbyte(&out, &n, &cap, c); continue; }
    char e = p->s[p->p++];
    if (e == '"' || e == '\\' || e == '/') pushbyte(&out, &n, &cap, (unsigned char)e);
    else if (e == 'b') pushbyte(&out, &n, &cap, '\b');
    else if (e == 'f') pushbyte(&out, &n, &cap, '\f');
    else if (e == 'n') pushbyte(&out, &n, &cap, '\n');
    else if (e == 'r') pushbyte(&out, &n, &cap, '\r');
    else if (e == 't') pushbyte(&out, &n, &cap, '\t');
    else if (e == 'u') {
      unsigned int cp = 0;
      for (int i = 0; i < 4; ++i) { char h = p->s[p->p++]; cp = cp * 16 + (isdigit((unsigned char)h) ? h - '0' : tolower((unsigned char)h) - 'a' + 10); }
      if (cp < 0x80) pushbyte(&out, &n, &cap, cp);
      else if (cp < 0x800) { pushbyte(&out, &n, &cap, 0xc0 | (cp >> 6)); pushbyte(&out, &n, &cap, 0x80 | (cp & 63)); }
      else { pushbyte(&out, &n, &cap, 0xe0 | (cp >> 12)); pushbyte(&out, &n, &cap, 0x80 | ((cp >> 6) & 63)); pushbyte(&out, &n, &cap, 0x80 | (cp & 63)); }
    }
  }
  if (!out) out = (char*)calloc(1, 1);
  return out;
}
static JVal parseValue(Parser *p) {
  skipws(p); JVal v = {0}; char c = p->s[p->p];
  if (c == '"') { v.kind = JSTRING; v.text = parseString(p); return v; }
  if (c == '[') {
    v.kind = JARRAY; p->p++; skipws(p);
    if (p->s[p->p] == ']') { p->p++; return v; }
    while (p->s[p->p]) {
      JVal x = parseValue(p); v.items = (JVal*)realloc(v.items, (v.len + 1) * sizeof(JVal)); v.items[v.len++] = x;
      skipws(p); if (p->s[p->p] == ',') { p->p++; continue; } if (p->s[p->p] == ']') { p->p++; break; }
    }
    return v;
  }
  if (strncmp(p->s + p->p, "true", 4) == 0) { v.kind = JBOOL; v.boolean = true; p->p += 4; return v; }
  if (strncmp(p->s + p->p, "false", 5) == 0) { v.kind = JBOOL; p->p += 5; return v; }
  if (strncmp(p->s + p->p, "null", 4) == 0) { p->p += 4; return v; }
  v.kind = JNUM; size_t start = p->p; if (c == '-') p->p++;
  while (p->s[p->p] && (isdigit((unsigned char)p->s[p->p]) || strchr(".eE+-", p->s[p->p]))) p->p++;
  size_t len = p->p - start; v.text = (char*)malloc(len + 1); memcpy(v.text, p->s + start, len); v.text[len] = 0; return v;
}
static long long asLong(JVal v) { return v.text ? strtoll(v.text, NULL, 10) : 0; }
static double asDouble(JVal v) { return v.text ? strtod(v.text, NULL) : 0; }
static bool asBoolean(JVal v) { return v.boolean; }
static char *asString(JVal v) { return v.text ? v.text : ""; }
static LongArray asLongArray(JVal v) { LongArray r = {(long long*)calloc(v.len ? v.len : 1, sizeof(long long)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asLong(v.items[i]); return r; }
static DoubleArray asDoubleArray(JVal v) { DoubleArray r = {(double*)calloc(v.len ? v.len : 1, sizeof(double)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asDouble(v.items[i]); return r; }
static StringArray asStringArray(JVal v) { StringArray r = {(char**)calloc(v.len ? v.len : 1, sizeof(char*)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asString(v.items[i]); return r; }
static LongMatrix asLongMatrix(JVal v) { LongMatrix r = {(LongArray*)calloc(v.len ? v.len : 1, sizeof(LongArray)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asLongArray(v.items[i]); return r; }
static DoubleMatrix asDoubleMatrix(JVal v) { DoubleMatrix r = {(DoubleArray*)calloc(v.len ? v.len : 1, sizeof(DoubleArray)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asDoubleArray(v.items[i]); return r; }
static StringMatrix asStringMatrix(JVal v) { StringMatrix r = {(StringArray*)calloc(v.len ? v.len : 1, sizeof(StringArray)), v.len}; for (size_t i=0;i<v.len;i++) r.data[i]=asStringArray(v.items[i]); return r; }
static void emitString(const char *s) {
  putchar('"');
  if (s) for (const unsigned char *p=(const unsigned char*)s; *p; ++p) {
    unsigned char c=*p;
    if (c == '"') fputs("\\\"", stdout); else if (c == '\\') fputs("\\\\", stdout);
    else if (c == '\n') fputs("\\n", stdout); else if (c == '\r') fputs("\\r", stdout); else if (c == '\t') fputs("\\t", stdout);
    else if (c < 32) printf("\\u%04x", c); else putchar(c);
  }
  putchar('"');
}
static void emitLongArray(LongArray v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');printf("%lld",v.data[i]);} putchar(']'); }
static void emitDoubleArray(DoubleArray v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');if(isfinite(v.data[i]))printf("%.17g",v.data[i]);else fputs("null",stdout);} putchar(']'); }
static void emitStringArray(StringArray v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');emitString(v.data[i]);} putchar(']'); }
static void emitLongMatrix(LongMatrix v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');emitLongArray(v.data[i]);} putchar(']'); }
static void emitDoubleMatrix(DoubleMatrix v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');emitDoubleArray(v.data[i]);} putchar(']'); }
static void emitStringMatrix(StringMatrix v) { putchar('['); for(size_t i=0;i<v.len;i++){if(i)putchar(',');emitStringArray(v.data[i]);} putchar(']'); }
`
}
function cEmitter(shape: any, expression: string): string {
  if (shape.kind === 'array') {
    const child = shape.item || { kind: 'number', decimal: false }
    if (child.kind === 'array') return child.item?.kind === 'string' ? `emitStringMatrix(${expression})` : child.item?.decimal ? `emitDoubleMatrix(${expression})` : `emitLongMatrix(${expression})`
    if (child.kind === 'string') return `emitStringArray(${expression})`
    if (child.decimal) return `emitDoubleArray(${expression})`
    return `emitLongArray(${expression})`
  }
  if (shape.kind === 'string') return `emitString(${expression})`
  if (shape.kind === 'boolean') return `printf(${expression} ? "true" : "false")`
  if (shape.kind === 'number' && shape.decimal) return `printf("%.17g", ${expression})`
  return `printf("%lld", (long long)(${expression}))`
}

function cHarness(q: CodingQuestion, code: string, marker: string): NativeHarness {
  const sig = nativeSignature(q, 'c')
  assertIdentifier(sig.functionName)
  const cases = q.tests.map((test) => JSON.stringify(expandTestArgs(test.args)))
  const declarations = sig.params.map((shape, index) => `${cType(shape)} arg${index} = ${cConvert(shape, `args.items[${index}]`)};`).join('\n  ')
  const args = sig.params.map((_, index) => `arg${index}`).join(', ')
  const source = `${cHelpers()}\n${code}\nstatic const char *CASES[] = {${cases.map((value) => JSON.stringify(value)).join(',')}};\nint main(int argc,char **argv){int index=argc>1?atoi(argv[1]):0;if(index<0||index>=${cases.length})return 2;Parser p={CASES[index],0};JVal args=parseValue(&p);${declarations}\n  ${cType(sig.result)} result=${sig.functionName}(${args});fputs(${JSON.stringify(marker)},stdout);${cEmitter(sig.result, 'result')};putchar('\\n');return 0;}\n`
  return { filename: 'main.c', source, caseCount: q.tests.length }
}

export function createNativeHarness(q: CodingQuestion, code: string, lang: CompiledCodeLang, marker: string): NativeHarness {
  if (lang === 'cpp') return cppHarness(q, code, marker)
  if (lang === 'java') return javaHarness(q, code, marker)
  if (lang === 'rust') return rustHarness(q, code, marker)
  if (lang === 'go') return goHarness(q, code, marker)
  return cHarness(q, code, marker)
}
