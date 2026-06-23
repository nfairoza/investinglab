import vtracer, re, os
base = os.path.dirname(os.path.abspath(__file__))

def lum(h): return 0.299*int(h[0:2],16)+0.587*int(h[2:4],16)+0.114*int(h[4:6],16)

# Smooth wordmarks: spline curves, low speckle, high path precision
wordmarks = [
    ("4a738411-1443-41ae-a89d-407653511a36.png", "rukmoney-com-wordmark.svg"),
    ("c27c296e-ba68-459e-9e02-fd1bec700acc.png", "rukmoney-ai-wordmark.svg"),
]
for inp, outp in wordmarks:
    op = os.path.join(base, outp)
    vtracer.convert_image_to_svg_py(
        os.path.join(base, inp), op,
        colormode="color", hierarchical="cutout", mode="spline",
        color_precision=8, layer_difference=16,
        filter_speckle=2, corner_threshold=60,
        length_threshold=4.0, splice_threshold=45,
        max_iterations=20, path_precision=8,
    )
    s = open(op, encoding="utf-8").read()
    paths = re.findall(r'<path[^>]*?/>', s)
    kept = [p for p in paths
            if not (re.search(r'fill="#([0-9A-Fa-f]{6})"', p)
                    and lum(re.search(r'fill="#([0-9A-Fa-f]{6})"', p).group(1)) > 200)]
    head = s[:s.find('<path')]
    open(op, "w", encoding="utf-8").write(head + "\n".join(kept) + "\n</svg>\n")
    print(outp, "->", len(kept), "paths,", os.path.getsize(op)//1024, "KB")

# Smooth icons: spline, finer gradient bands, low speckle
icons = [
    ("82ae7720-a1c1-4209-8eb4-52462ecebab6.png", "ruk-app-icon.svg", 10, 16),
    ("9e1ad378-43de-4745-81a8-faa421c7fcf8.png", "rm-icon-rounded.svg", 8, 8),
    ("ChatGPT Image Jun 23, 2026, 10_55_59 AM.png", "rm-icon.svg", 8, 8),
]
for inp, outp, cp, ld in icons:
    op = os.path.join(base, outp)
    vtracer.convert_image_to_svg_py(
        os.path.join(base, inp), op,
        colormode="color", hierarchical="stacked", mode="spline",
        color_precision=cp, layer_difference=ld,
        filter_speckle=2, corner_threshold=60,
        length_threshold=4.0, splice_threshold=45,
        max_iterations=20, path_precision=8,
    )
    print(outp, "->", os.path.getsize(op)//1024, "KB")
