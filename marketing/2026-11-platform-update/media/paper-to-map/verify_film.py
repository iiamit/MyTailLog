"""Validate the full-motion exports, source integrity and caption/audio timing."""
import ast,hashlib,io,json,re,subprocess,sys
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from build_media import FFMPEG
HERE=Path(__file__).resolve().parent;OUT=HERE/'film'

def main():
 p=json.loads((OUT/'production.json').read_text());duration=p['duration_seconds']
 assert 60<=duration<=90
 timing=json.loads((OUT/'timing.json').read_text());assert len(timing)==10
 assert abs(sum(s['duration'] for s in timing)-duration)<.01
 captions=json.loads((OUT/'captions.json').read_text());assert all(0<=c['start']<c['end']<=duration for c in captions)
 assert all(a['end']<=b['start'] for a,b in zip(captions,captions[1:]))
 assert captions[-1]['end']>duration-3
 script=(OUT/'narration.txt').read_text();assert 'AD tracking' in script and 'coming soon' in script.lower()
 assert 'ay dee' in json.loads((OUT/'alignment-03.json').read_text())['_request_text']
 for name,expected in p['clip_sha256'].items():assert hashlib.sha256((HERE/'footage'/name).read_bytes()).hexdigest()==expected
 results={'checks':'passed','duration_seconds':duration,'physical_motion_clips':4,'caption_count':len(captions),'videos':[]}
 audio=[]
 for variant in ('clean','captioned'):
  video=OUT/f'mytaillog-paper-to-map-{variant}-1080x1920.mp4'
  metadata=subprocess.run([FFMPEG,'-threads','2','-filter_threads','1','-hide_banner','-i',str(video)],capture_output=True,text=True).stderr
  assert all(v in metadata for v in ['1080x1920','30 fps','Video: h264','Audio: aac'])
  m=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',metadata);actual=sum(float(n)*f for n,f in zip(m.groups(),[3600,60,1]));assert abs(actual-duration)<.12
  subprocess.run([FFMPEG,'-threads','2','-filter_threads','1','-v','error','-i',str(video),'-f','null','-'],check=True)
  loud=subprocess.run([FFMPEG,'-threads','2','-filter_threads','1','-hide_banner','-i',str(video),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
  stats=json.JSONDecoder().raw_decode(loud[loud.rindex('{'):])[0];assert -18<float(stats['input_i'])<-14;assert float(stats['input_tp'])<=-1
  audio.append(subprocess.check_output([FFMPEG,'-threads','2','-filter_threads','1','-v','error','-i',str(video),'-map','0:a','-f','hash','-hash','sha256','-']).decode().strip())
  results['videos'].append({'file':video.name,'bytes':video.stat().st_size,'duration':actual,'integrated_lufs':stats['input_i'],'true_peak_dbtp':stats['input_tp']})
 assert audio[0]==audio[1], 'Caption burn-in changed audio'
 results['motion_checks']=[]
 video=OUT/'mytaillog-paper-to-map-clean-1080x1920.mp4'
 for shot in timing[:-1]:
  frames=[]
  for t in [shot['start']+1,shot['start']+shot['duration']-1]:
   data=subprocess.check_output([FFMPEG,'-threads','2','-filter_threads','1','-v','error','-ss',str(t),'-i',str(video),'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
   im=Image.open(io.BytesIO(data));im=im if shot['start']<32 else im.crop((0,460,1080,1580));frames.append(im.resize((180,320)).convert('L'))
  change=ImageStat.Stat(ImageChops.difference(*frames)).mean[0];assert change>2,shot['name']
  results['motion_checks'].append({'shot':shot['name'],'mean_pixel_change':round(change,2)})
 ast.parse((HERE/'build_film.py').read_text())
 (OUT/'verification.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
if __name__=='__main__':main()
