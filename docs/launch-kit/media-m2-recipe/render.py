"""Offline reviewed-capture preparation. Writes only to an ignored output directory."""
from pathlib import Path
import subprocess, json, hashlib, textwrap, html, os, struct, argparse
from PIL import Image

RECIPE_DIR = Path(__file__).resolve().parent
ROOT = RECIPE_DIR.parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT/'outputs/launch-run/media-m2-reproduction')
parser.add_argument('--font', type=Path, help='An existing licensed local font; required for video rendering only')
parser.add_argument('--text-only', action='store_true', help='Reproduce captions, transcripts and plain-text storyboards without FFmpeg or image extraction')
args = parser.parse_args()
BASE = args.output.resolve()
if not BASE.is_relative_to((ROOT/'outputs').resolve()): raise RuntimeError('Output must stay in this checkout outputs directory')
if not args.text_only and (not args.font or not args.font.is_file()): raise RuntimeError('Requested local font is unavailable')
BASE.mkdir(parents=True,exist_ok=True)
COMMIT = '76ec7bf0b9812e670207cba199b8d07cc07839fd'
COMMANDS = []

def command(args):
    COMMANDS.append(args)
    (BASE/'commands.json').write_text(json.dumps(COMMANDS, indent=2), encoding='utf-8', newline='\n')
    try:
        subprocess.run(args, cwd=BASE, check=True, capture_output=True)
    except subprocess.CalledProcessError as error:
        failure_file=BASE/'failures.json'
        failures=json.loads(failure_file.read_text(encoding='utf-8')) if failure_file.exists() else []
        failures.append({'command':args,'returncode':error.returncode,'stderr':error.stderr.decode(errors='replace')})
        failure_file.write_text(json.dumps(failures,indent=2),encoding='utf-8', newline='\n')
        raise

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def probe(path):
    result=subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)], check=True, capture_output=True)
    return json.loads(result.stdout)
def stamp(seconds): return f'{seconds//3600:02d}:{seconds//60%60:02d}:{seconds%60:02d}.000'
def rel(path): return Path(os.path.relpath(path, BASE)).as_posix()

def plain_storyboard(name, scenes):
    lines=[f'VibeScroll {name} static walkthrough','',f'Edited synthetic candidate captures from October 22, 2026, source commit {COMMIT}. Editorial holds are not measured processing time. No real processing, customer result, repository inspection or publication is shown.','']
    at=0
    for index,scene in enumerate(scenes,1):
        lines.append(f'Scene {index}, {at}-{at+scene["duration"]} seconds: {scene["caption"]}')
        at+=scene['duration']
    lines+=['','The issue draft is not an implementation plan. Source permissions and hashes are recorded in docs/launch-kit/assets.json. No private Reel, founder crop, generated UI, music or voice was used.','Desktop presentations use uncropped scaling and letterboxing. Mobile presentations retain the original source width with a caption band.']
    return '\n'.join(lines)+'\n'

for folder in ('sources','text','segments','edits','posters','review-frames','storyboards'):
    (BASE/folder).mkdir(exist_ok=True)
manifest=json.loads((RECIPE_DIR/'source-assets.json').read_text(encoding='utf-8'))
approved={row['path']: row for row in manifest['sources']}
source_records=[]
def approved_file(path):
    row=approved[path]; file=(RECIPE_DIR/'sources/overview-76ec7bf.mp4') if path=='/product/overview.mp4' else ROOT/'apps/starter/public'/path.lstrip('/')
    if sha(file)!=row['sha256']: raise RuntimeError(f'Approved source hash mismatch: {path}')
    if row.get('synthetic') is not True: raise RuntimeError('This recipe deliberately uses synthetic captures only')
    if not any(record['path']==path for record in source_records):
        source_records.append({'path':path,'sha256':sha(file),'bytes':file.stat().st_size,'sourceCommit':row.get('sourceCommit',row.get('captureCommit')),'synthetic':True,'rightsReview':row.get('rightsReview',row.get('privacyReview')),'approvalStatus':row.get('approvalStatus',row.get('status')),'reviewer':row.get('reviewer')})
    return file

video=approved_file('/product/overview.mp4')
product_captions=[
    'Make scrolling useful. Actual candidate interface with synthetic data.',
    'Save permitted material. Manual analysis is shown; automatic processing needs its own permission.',
    'Simulated waiting fixture. No processing job is running.',
    'Inspect the source evidence. Check coverage before acting.',
    'Review a private issue draft. Publication needs separate approval.',
    'No fit is a useful decision. An idea need not become code.',
    'Return to the source. Explore the labelled example.',
]
times=[0,5,11,15,22,28,34]; durations=[5,6,4,7,6,6,6]
product=[]
for index,(time,duration,caption) in enumerate(zip(times,durations,product_captions),1):
    target=BASE/'sources'/f'overview-{index:02d}.png'
    if not args.text_only:
        command(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-ss',str(time+.25),'-i',str(video),'-frames:v','1','-vf','crop=390:700:0:0',str(target)])
    product.append({'image':rel(target),'source':'/product/overview.mp4','sourceTimeSeconds':time+.25,'crop':'390:700:0:0; removes the original editorial caption band only','duration':duration,'caption':caption})

families={
 'product':{'duration':40,'scenes':product},
 'library':{'duration':24,'scenes':[
  {'source':'/product/library-light-390.png','desktopSource':'/product/library-light-1440.png','duration':6,'caption':'Return to saved ideas. This Library contains synthetic records.'},
  {'source':'/help/source-evidence.png','duration':6,'caption':'Inspect the source evidence. A ready label does not verify a claim.'},
  {'source':'/product/library-dark-390.png','desktopSource':'/product/library-dark-1440.png','duration':6,'caption':'The same synthetic Library in dark appearance. No shared catalog access is shown.'},
  {'source':'/help/library-tree.png','desktopSource':'/product/library-light-1440.png','duration':6,'caption':'Keep the source beside the idea. Try the labelled Library example.'},
 ]},
 'social':{'duration':20,'scenes':[
  {'source':'/help/save-form.png','duration':5,'caption':'Save permitted material. This example uses manual analysis.'},
  {'source':'/help/source-evidence.png','duration':5,'caption':'Inspect the evidence. Synthetic data explains the workflow.'},
  {'source':'/help/project-draft.png','duration':5,'caption':'Review a private issue draft. Nothing is published here.'},
  {'source':'/help/no-fit.png','duration':5,'caption':'No fit is useful too. Inspect the example at scroll.companynerve.com/example.'},
 ]},
}
for family in families.values():
    for scene in family['scenes']:
        for field in ('source','desktopSource'):
            if field in scene: approved_file(scene[field])

recipe={'version':'m2-review-only-v1','sourceCommit':COMMIT,'capturedAt':'2026-10-22','synthetic':True,'status':'private preparation; root frame review required; not public or published','editorialDisclosure':'Reordered approved native still captures with editorial holds. No real processing, live account connection, customer result, repository inspection or measured latency. Product issue-draft scene is not a plan. Separate setup walkthrough keeps its original UI sequence and 90-second duration; its final issue-draft caption was corrected.','families':families}
(BASE/'recipe.json').write_text(json.dumps(recipe,indent=2),encoding='utf-8', newline='\n')
font=args.font.resolve().as_posix().replace(':', r'\:').replace("'", r"\'") if args.font else None
assets=[]
for name,family in families.items():
    scenes=family['scenes']; at=0; cues=[]; transcript=[]
    for index,scene in enumerate(scenes,1):
        end=at+scene['duration']; cues.append(f'{index}\n{stamp(at)} --> {stamp(end)}\n{scene["caption"]}\n'); transcript.append(f'{stamp(at)} {scene["caption"]}\nSource: {scene["source"]}'+(f' at {scene["sourceTimeSeconds"]} seconds, top 390x700 native UI region' if 'sourceTimeSeconds' in scene else '')); at=end
    (BASE/'edits'/f'{name}.vtt').write_text('WEBVTT\n\n'+'\n'.join(cues),encoding='utf-8', newline='\n')
    (BASE/'edits'/f'{name}-transcript.txt').write_text(f'VibeScroll {name} edit\n\n'+recipe['editorialDisclosure']+f'\nSynthetic candidate {COMMIT}, captured October 22, 2026.\n\n'+'\n\n'.join(transcript),encoding='utf-8', newline='\n')
    (BASE/'edits'/f'{name}-storyboard.txt').write_text(plain_storyboard(name, scenes),encoding='utf-8',newline='\n')
    if args.text_only: continue
    for layout in ('desktop','mobile'):
        width,height=(1280,900) if layout=='desktop' else ((390,1100) if name=='library' else (390,900))
        segments=[]
        for index,scene in enumerate(scenes,1):
            source=BASE/scene['image'] if 'image' in scene else approved_file(scene.get('desktopSource',scene['source']) if layout=='desktop' else scene['source'])
            caption_file=BASE/'text'/f'{name}-{layout}-{index:02d}.txt'
            caption_file.write_text(textwrap.fill(scene['caption'],width=36 if layout=='mobile' else 36 if name!='library' else 68),encoding='utf-8',newline='\n')
            label_file=BASE/'text'/'label.txt'; label_file.write_text('Edited synthetic candidate UI',encoding='utf-8', newline='\n')
            provenance_file=BASE/'text'/'provenance.txt'; provenance_file.write_text('Captured Oct 22, 2026 | Candidate 76ec7bf | No live processing',encoding='utf-8', newline='\n')
            if layout=='mobile':
                area=height-200
                visual=f'scale=390:{area}:force_original_aspect_ratio=decrease,pad=390:{area}:(ow-iw)/2:(oh-ih)/2:color=0x171717,pad={width}:{height}:0:0:color=0x171717'
                lx,ly,ls,cx,cy,cs,px,py,ps=16,area+15,13,16,area+46,18,12,height-23,10
            elif name=='library':
                visual='scale=1280:650:force_original_aspect_ratio=decrease,pad=1280:650:(ow-iw)/2:(oh-ih)/2:color=0x171717,pad=1280:900:0:0:color=0x171717'
                lx,ly,ls,cx,cy,cs,px,py,ps=48,680,21,48,720,30,48,865,15
            else:
                visual='scale=440:780:force_original_aspect_ratio=decrease,pad=520:900:(ow-iw)/2:(oh-ih)/2:color=0x171717,pad=1280:900:0:0:color=0x171717'
                lx,ly,ls,cx,cy,cs,px,py,ps=580,245,22,580,300,32,580,820,14
            filters=visual+f",drawtext=fontfile='{font}':textfile='{rel(label_file)}':fontcolor=0x74e1ba:fontsize={ls}:x={lx}:y={ly}"
            # This Windows FFmpeg build draws newline control glyphs even with LF.
            # Render separate single-line text files instead of a multiline drawtext.
            for line_index,line in enumerate(caption_file.read_text(encoding='utf-8').splitlines()):
                line_file=caption_file.with_name(caption_file.stem+f'-line-{line_index+1}.txt')
                line_file.write_text(line,encoding='utf-8', newline='\n')
                filters+=f",drawtext=fontfile='{font}':textfile='{rel(line_file)}':fontcolor=white:fontsize={cs}:x={cx}:y={cy+line_index*(cs+8)}"
            filters+=f",drawtext=fontfile='{font}':textfile='{rel(provenance_file)}':fontcolor=0xb8b8b8:fontsize={ps}:x={px}:y={py},setsar=1,format=yuv420p"
            filter_file=BASE/'text'/f'{name}-{layout}-{index:02d}.filter';filter_file.write_text(filters,encoding='utf-8', newline='\n')
            segment=BASE/'segments'/f'{name}-{layout}-{index:02d}.mp4'
            command(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-loop','1','-framerate','12','-i',str(source),'-t',str(scene['duration']),'-filter_script:v',str(filter_file),'-an','-c:v','libx264','-preset','veryfast','-crf','20','-threads','2','-movflags','+faststart',str(segment)])
            segments.append(segment)
        concat_file=BASE/'segments'/f'{name}-{layout}.concat';concat_file.write_text(''.join(f"file '{segment.name}'\n" for segment in segments),encoding='utf-8', newline='\n')
        output=BASE/'edits'/f'{name}-{layout}.mp4'
        command(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(concat_file),'-c','copy','-movflags','+faststart',str(output)])
        fallback=output.with_suffix('.webm')
        command(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-i',str(output),'-an','-c:v','libvpx-vp9','-b:v','0','-crf','32','-deadline','good','-cpu-used','5','-row-mt','1','-threads','2',str(fallback)])
        poster=BASE/'posters'/f'{name}-{layout}.png'
        command(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-ss','0.2','-i',str(output),'-frames:v','1',str(poster)])
        at=0
        for index,scene in enumerate(scenes,1):
            review=BASE/'review-frames'/f'{name}-{layout}-{index:02d}.png'
            command(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-ss',str(at+.5),'-i',str(output),'-frames:v','1',str(review)])
            at+=scene['duration']
        for path in (output,fallback,poster):
            data={'file':rel(path),'bytes':path.stat().st_size,'sha256':sha(path),'family':name,'layout':layout,'synthetic':True,'sourceCommit':COMMIT,'rootReview':'pending'}
            if path.suffix in ('.mp4','.webm'):
                info=probe(path); data.update({'durationSeconds':float(info['format']['duration']),'streams':[{key:stream[key] for key in ('codec_name','codec_type','width','height','pix_fmt','r_frame_rate') if key in stream} for stream in info['streams']]})
            assets.append(data)
        print(f'Rendered {name}-{layout}: {family["duration"]} seconds, {width}x{height}',flush=True)
    body=''.join(f'<section><h2>{i+1}. {html.escape(scene["caption"])}</h2><p>Editorial hold: {scene["duration"]} seconds. Source {html.escape(scene["source"])}.</p><img src="../review-frames/{name}-mobile-{i+1:02d}.png" alt="Exported synthetic {name} scene {i+1}" style="max-width:390px;width:100%;height:auto"></section>' for i,scene in enumerate(scenes))
    (BASE/'storyboards'/f'{name}.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Review-only {name} storyboard</title><body style="font:18px/1.6 system-ui;max-width:800px;margin:auto;padding:24px"><h1>Review-only {name} storyboard</h1><p>{html.escape(recipe["editorialDisclosure"])}</p><p>Source candidate {COMMIT}, October 22, 2026. No private Reel or founder crop used.</p>{body}</body></html>',encoding='utf-8', newline='\n')

for name in families:
    for suffix in ('.vtt','-transcript.txt','-storyboard.txt'):
        path=BASE/'edits'/f'{name}{suffix}';assets.append({'file':rel(path),'bytes':path.stat().st_size,'sha256':sha(path),'family':name,'rootReview':'pending'})
result={'version':'m2-review-only-v1','status':'pending root frame/semantic review; not public','sourceCommit':COMMIT,'sources':source_records,'assets':assets,'recipe':'recipe.json','commands':'commands.json','renderer':'render.py','ffmpegVersion':None if args.text_only else subprocess.run(['ffmpeg','-version'],capture_output=True,text=True).stdout.splitlines()[0],'limits':recipe['editorialDisclosure']+' Desktop uses uncropped scaling/letterboxing; mobile preserves the 390-pixel source width with a caption band. No voice/music, animation of UI state, new capture, new source retrieval or provider call. Native/browser encoding acceptance and final publication remain pending.'}
for asset in assets:
    path=BASE/asset['file']; asset['format']=path.suffix.lstrip('.')
    if path.suffix=='.png':
        with Image.open(path) as image: asset.update(width=image.width,height=image.height)
for folder in ('storyboards','review-frames','sources'):
    for path in sorted((BASE/folder).glob('*')):
        if not path.is_file(): continue
        row={'file':rel(path),'format':path.suffix.lstrip('.'),'bytes':path.stat().st_size,'sha256':sha(path),'synthetic':True,'sourceCommit':COMMIT,'rootReview':'pending'}
        if path.suffix=='.png':
            with Image.open(path) as image: row.update(width=image.width,height=image.height)
        assets.append(row)
result.update(failures='failures.json',verification='verification.json',encodingComparison='VP9 fallbacks are larger than H.264 at these conservative quality settings; no bandwidth-saving claim. H.264 remains the primary candidate.')
(BASE/'manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8', newline='\n')
print('Text alternatives prepared; no FFmpeg invoked.' if args.text_only else 'All six edits and six VP9 fallbacks prepared. Root review required.',flush=True)
