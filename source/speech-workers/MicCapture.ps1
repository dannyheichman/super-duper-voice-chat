# MicCapture.ps1
# Purpose : Capture the default microphone as raw 16 kHz mono 16-bit PCM using winmm waveIn (no compiler or admin needed).
# Inputs  : none (default recording device).
# Outputs : raw PCM bytes on stdout until the process is stopped.
# Depends : Windows winmm.dll, PowerShell 5.1.
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class WaveIn {
  [StructLayout(LayoutKind.Sequential)] public struct Format { public ushort Tag, Channels; public uint Rate, BytesPerSecond; public ushort BlockAlign, Bits, ExtraSize; }
  [StructLayout(LayoutKind.Sequential)] public struct Header { public IntPtr Data; public uint Length, Recorded; public IntPtr User; public uint Flags, Loops; public IntPtr Next, Reserved; }
  [DllImport("winmm.dll")] public static extern int waveInOpen(out IntPtr handle, int device, ref Format format, IntPtr callback, IntPtr instance, int flags);
  [DllImport("winmm.dll")] public static extern int waveInPrepareHeader(IntPtr handle, IntPtr header, int size);
  [DllImport("winmm.dll")] public static extern int waveInAddBuffer(IntPtr handle, IntPtr header, int size);
  [DllImport("winmm.dll")] public static extern int waveInStart(IntPtr handle);
  public static void Run() {
    var format = new Format { Tag = 1, Channels = 1, Rate = 16000, BytesPerSecond = 32000, BlockAlign = 2, Bits = 16 };
    IntPtr handle; int result = waveInOpen(out handle, -1, ref format, IntPtr.Zero, IntPtr.Zero, 0);
    if (result != 0) { Console.Error.WriteLine("waveInOpen failed " + result); return; }
    int headerSize = Marshal.SizeOf(typeof(Header)), bufferBytes = 3200, count = 8;
    var headers = new IntPtr[count];
    for (int i = 0; i < count; i++) {
      headers[i] = Marshal.AllocHGlobal(headerSize);
      var header = new Header { Data = Marshal.AllocHGlobal(bufferBytes), Length = (uint)bufferBytes };
      Marshal.StructureToPtr(header, headers[i], false);
      waveInPrepareHeader(handle, headers[i], headerSize); waveInAddBuffer(handle, headers[i], headerSize);
    }
    waveInStart(handle);
    var output = Console.OpenStandardOutput(); var bytes = new byte[bufferBytes];
    for (int i = 0; ; i = (i + 1) % count) {
      var header = (Header)Marshal.PtrToStructure(headers[i], typeof(Header));
      while ((header.Flags & 1) == 0) { System.Threading.Thread.Sleep(10); header = (Header)Marshal.PtrToStructure(headers[i], typeof(Header)); }
      Marshal.Copy(header.Data, bytes, 0, (int)header.Recorded);
      output.Write(bytes, 0, (int)header.Recorded); output.Flush();
      waveInAddBuffer(handle, headers[i], headerSize);
    }
  }
}
'@
[WaveIn]::Run()
