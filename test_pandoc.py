import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('42.96.15.5', port=26266, username='root', password='#_d7^g=+U', timeout=10)
stdin, stdout, stderr = ssh.exec_command(r'''
touch dummy.png
cat << 'EOF' > /tmp/test39.tex
\begin{document}
\begin{center}
\begin{center}
\includegraphics{dummy.png}
\end{center}
\end{center}
\end{document}
EOF
pandoc /tmp/test39.tex -o /tmp/test39.docx
echo "EXIT CODE: $?"
''')
print("Stdout:", stdout.read().decode())
print("Stderr:", stderr.read().decode())
ssh.close()
