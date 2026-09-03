#!/usr/bin/env python3
"""CI 诊断辅助（决策 36）：把 junitxml 里的失败转成 ::error:: 注解，
使未鉴权的公开 API（check-runs annotations）也能读到失败测试名与消息。"""
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1] if len(sys.argv) > 1 else "pytest-report.xml"
root = ET.parse(path).getroot()
n = 0
for tc in root.iter("testcase"):
    f = tc.find("failure")
    if f is None:
        f = tc.find("error")
    if f is None:
        continue
    msg = (f.get("message") or " ".join((f.text or "").split()))[:280]
    name = f"{tc.get('classname', '')}::{tc.get('name', '')}"
    print(f"::error::{name} :: {msg}")
    n += 1
    if n >= 40:
        print("::error::(更多失败省略)")
        break
