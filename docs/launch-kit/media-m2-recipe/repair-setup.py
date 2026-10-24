"""Prepare the historical setup caption repair in ignored outputs, never publish it."""
from pathlib import Path
import argparse, hashlib, json, subprocess

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output',type=Path,default=ROOT/'outputs/launch-run/media-m2-candidate/setup-correction')
parser.add_argument('--font',type=Path,required=True)
args=parser.parse_args(); output=args.output.resolve()
if not output.is_relative_to((ROOT/'outputs').resolve()): raise RuntimeError('Output must stay in ignored checkout outputs')
if not args.font.is_file(): raise RuntimeError('Local font unavailable')
source=HERE/'sources/setup-76ec7bf.mp4'
expected='94da2151b29b1406bc6b1dd10cc2f52ca4714f0772e86e476a082b24cb7f40a0'
if hashlib.sha256(source.read_bytes()).hexdigest()!=expected: raise RuntimeError('Historical setup input hash mismatch')
output.mkdir(parents=True,exist_ok=True)
font=args.font.resolve().as_posix().replace(':',r'\:').replace("'",r"\'")
lines=[('Edited synthetic candidate UI',14,734,'0x74e1ba'),('Inspect a private issue draft. Coding and publication need separate approval.',22,762,'white'),('Try the written guide; independent setup acceptance is still pending.',22,800,'white')]
filters="drawbox=x=0:y=720:w=1280:h=120:color=0x0f1b23:t=fill:enable='gte(t,80)'"
for index,(text,size,y,color) in enumerate(lines):
    path=output/f'caption-{index}.txt';path.write_text(text,encoding='utf-8', newline='\n')
    filters+=f",drawtext=fontfile='{font}':textfile='{path.name}':fontsize={size}:fontcolor={color}:x=18:y={y}:enable='gte(t,80)'"
filter_path=output/'setup-final-caption.filter';filter_path.write_text(filters,encoding='utf-8', newline='\n')
destination=output/'setup-walkthrough.mp4'
command=['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-i',str(source),'-filter_script:v',str(filter_path),'-an','-r','12','-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart',str(destination)]
(output/'commands.json').write_text(json.dumps([command],indent=2), encoding='utf-8', newline='\n')
subprocess.run(command,cwd=output,capture_output=True,check=True)
for second in (2,42,79,82):
    subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','1','-ss',str(second),'-i',str(destination),'-frames:v','1',str(output/f'setup-corrected-{second}s.png')],capture_output=True,check=True)
subprocess.run(['ffmpeg','-v','error','-threads','2','-filter_threads','1','-i',str(destination),'-f','null','-'],capture_output=True,check=True)
probe=json.loads(subprocess.run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(destination)],capture_output=True,check=True).stdout)
assert float(probe['format']['duration'])==90 and len(probe['streams'])==1
stream=probe['streams'][0]; assert stream['width']==1280 and stream['height']==840 and stream['r_frame_rate']=='12/1' and stream['codec_name']=='h264'
record={'status':'private caption correction; root exported-frame review required before replacement','sourceSha256':expected,'sourceCommit':'76ec7bf0b9812e670207cba199b8d07cc07839fd','sourceDimensions':[1280,840],'nativeUiBounds':[0,0,1280,720],'captionBandBounds':[0,720,1280,120],'affectedSeconds':[80,90],'actualSequenceSeconds':90,'editorialChange':'Correct issue-draft terminology in the final historical caption band only; original UI sequence and timing retained. Consistent H.264 re-encode can alter compression pixels. No reshoot, new UI, generated result, source retrieval or provider call.','bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'codec':stream['codec_name'],'profile':stream['profile'],'pixFmt':stream['pix_fmt'],'fullDecode':'passed','durationSeconds':90}
(output/'verification.json').write_text(json.dumps(record,indent=2), encoding='utf-8', newline='\n')
print(json.dumps(record))
