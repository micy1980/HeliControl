param(
  [string]$StartPath = '',
  [switch]$CompileOnly
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class NativeFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialog {}

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(FOS fos);
    void GetOptions(out FOS pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int alignment);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(SIGDN sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }

  private enum SIGDN : uint {
    FILESYSPATH = 0x80058000
  }

  [Flags]
  private enum FOS : uint {
    NOCHANGEDIR = 0x00000008,
    PICKFOLDERS = 0x00000020,
    FORCEFILESYSTEM = 0x00000040,
    PATHMUSTEXIST = 0x00000800,
    DONTADDTORECENT = 0x02000000
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  private static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid, out IShellItem ppv);

  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  private static extern bool SetForegroundWindow(IntPtr hWnd);

  public static string Pick(string startPath) {
    IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialog();
    dialog.SetOptions(FOS.PICKFOLDERS | FOS.FORCEFILESYSTEM | FOS.PATHMUSTEXIST | FOS.NOCHANGEDIR | FOS.DONTADDTORECENT);
    dialog.SetTitle("Ment\u00e9si \u00fatvonal kiv\u00e1laszt\u00e1sa");
    dialog.SetOkButtonLabel("Kiv\u00e1laszt\u00e1s");

    if (!String.IsNullOrWhiteSpace(startPath) && Directory.Exists(startPath)) {
      Guid shellItemGuid = typeof(IShellItem).GUID;
      IShellItem folder;
      SHCreateItemFromParsingName(startPath, IntPtr.Zero, ref shellItemGuid, out folder);
      if (folder != null) {
        dialog.SetFolder(folder);
      }
    }

    IntPtr owner = GetForegroundWindow();
    if (owner != IntPtr.Zero) {
      SetForegroundWindow(owner);
    }

    int hr = dialog.Show(owner);
    if (hr == unchecked((int)0x800704C7)) {
      return "";
    }
    if (hr != 0) {
      Marshal.ThrowExceptionForHR(hr);
    }

    IShellItem result;
    dialog.GetResult(out result);
    IntPtr pathPtr;
    result.GetDisplayName(SIGDN.FILESYSPATH, out pathPtr);
    try {
      return Marshal.PtrToStringUni(pathPtr);
    } finally {
      Marshal.FreeCoTaskMem(pathPtr);
    }
  }
}
"@

if ($CompileOnly) {
  [Console]::Out.Write('ok')
  exit 0
}

try {
  $fallback = [Environment]::GetFolderPath('Desktop')
  $start = if ($StartPath -and (Test-Path -LiteralPath $StartPath -PathType Container)) { $StartPath } else { $fallback }
  $selected = [NativeFolderPicker]::Pick($start)
  if ($selected) {
    [Console]::Out.Write($selected)
  }
  exit 0
} catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
