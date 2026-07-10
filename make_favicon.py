from PIL import Image, ImageDraw
img = Image.new('RGBA', (64, 64), (0,0,0,0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((6, 6, 58, 58), fill=(14, 165, 233, 255), radius=10)
d.text((18, 20), 'S', fill=(255, 255, 255, 255))
img.save('app/favicon.ico')
print('saved')
