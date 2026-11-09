#!/usr/bin/env python3
"""Compare a browser parity snapshot against OpenCV and, optionally, Python ORT.
Photos/model files stay on the researcher's machine. No network calls.
Dependencies: numpy, opencv-python; onnxruntime only with --model.
"""
import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--model")
    parser.add_argument("--report")
    parser.add_argument("--input-atol", type=float, default=0)
    parser.add_argument("--output-atol", type=float, default=1e-5)
    args = parser.parse_args()
    import cv2
    import numpy as np
    snapshot = json.loads(Path(args.snapshot).read_text())
    cfg = snapshot["config"]
    if snapshot.get("schemaVersion") != 1:
        raise ValueError("Unsupported diagnostic schema")
    def unpack(t):
        if t["encoding"] != "float32-le/base64":
            raise ValueError("Unsupported tensor encoding")
        return np.frombuffer(base64.b64decode(t["data"]), dtype="<f4").reshape(t["dims"])
    browser = unpack(snapshot["input"])
    # IMREAD_COLOR applies EXIF orientation by default, matching from-image.
    image = cv2.imdecode(np.frombuffer(Path(args.image).read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Cannot decode image")
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    h, w = image.shape[:2]
    if (w, h) != (snapshot["image"]["width"], snapshot["image"]["height"]):
        raise ValueError("Different image dimensions/orientation")
    tw, th = cfg["input"]["width"], cfg["input"]["height"]
    prep = cfg["preprocessing"]
    if prep["resize"] == "letterbox":
        r = min(tw/w, th/h)
        nw, nh = round(w*r), round(h*r)
        left, top = round((tw-nw)/2-0.1), round((th-nh)/2-0.1)
        pixels = np.full((th, tw, 3), prep["padValue"], dtype=np.uint8)
        pixels[top:top+nh, left:left+nw] = cv2.resize(image, (nw, nh), interpolation=cv2.INTER_LINEAR)
    else:
        pixels = cv2.resize(image, (tw, th), interpolation=cv2.INTER_LINEAR)
    expected = (pixels.astype(np.float64)*prep["scale"]-np.array(prep["mean"]))/np.array(prep["std"])
    expected = np.ascontiguousarray(expected.transpose(2, 0, 1)[None], dtype=np.float32)
    def compare(actual, reference, atol):
        if actual.shape != reference.shape:
            return {"pass": False, "shape_actual": list(actual.shape), "shape_expected": list(reference.shape)}
        finite = bool(np.isfinite(actual).all() and np.isfinite(reference).all())
        diff = np.abs(actual.astype(np.float64)-reference.astype(np.float64))
        return {"pass": finite and bool(np.all(diff <= atol)), "max_abs": float(np.max(diff, initial=0)),
                "mean_abs": float(np.mean(diff)) if diff.size else 0, "atol": atol, "finite": finite}
    report = {"model_sha256": snapshot["modelHash"], "scope": snapshot["scope"],
              "input_cv2_vs_browser": compare(browser, expected, args.input_atol), "outputs": None,
              "note": "Browser drawImage and cv2 INTER_LINEAR may differ. A failed comparison is not parity."}
    if args.model:
        import onnxruntime as ort
        model_bytes = Path(args.model).read_bytes()
        if hashlib.sha256(model_bytes).hexdigest() != snapshot["modelHash"]:
            raise ValueError("ONNX hash differs from browser snapshot")
        session = ort.InferenceSession(model_bytes, providers=["CPUExecutionProvider"])
        name = cfg["input"]["name"]
        names = [o.name for o in session.get_outputs()]
        on_browser = session.run(names, {name: browser})
        on_cv2 = session.run(names, {name: expected})
        report["python_ort_version"] = ort.__version__
        report["outputs"] = {}
        for output, a, b in zip(names, on_browser, on_cv2):
            original = unpack(snapshot["outputs"][output])
            report["outputs"][output] = {
                "ort_same_input": compare(a, original, args.output_atol),
                "cv2_input_vs_browser_output": compare(b, original, args.output_atol)}
    text = json.dumps(report, indent=2, allow_nan=False)
    print(text)
    if args.report:
        Path(args.report).write_text(text+"\n")
    ok = report["input_cv2_vs_browser"]["pass"]
    if report["outputs"]:
        ok = ok and all(v["ort_same_input"]["pass"] and v["cv2_input_vs_browser_output"]["pass"] for v in report["outputs"].values())
    return 0 if ok else 1

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, ImportError, KeyError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2)
